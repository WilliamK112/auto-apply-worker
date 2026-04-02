/**
 * Auto-Apply Worker — Human-in-the-Loop Browser Automation
 *
 * Architecture:
 * 1. Polls application-os for PENDING queue items
 * 2. Opens each job URL in a headless Chromium (Playwright)
 * 3. Fills forms and attempts to submit
 * 4. On CAPTCHA: pauses and sets NEEDS_VERIFICATION — user resolves via /auto-apply/verify/{token}
 * 5. On success: marks COMPLETED; on failure: marks FAILED with error message
 *
 * Environment variables (see .env.example):
 *   AUTO_APPLY_WORKER_SECRET  — shared secret with application-os
 *   AUTO_APPLY_APP_OS_URL     — e.g., http://localhost:3000 (or production URL)
 *   AUTO_APPLY_USER_ID        — which user's queue to process
 *   AUTO_APPLY_DELAY_MS       — delay between processing jobs (default 5000)
 *   AUTO_APPLY_HEADLESS       — "true" or "false" (default true)
 */

import "dotenv/config";
import { BrowserManager } from "./browser";
import { AppOsApi } from "./api";
import { fillAndSubmitGreenhouseApplication } from "./fillers/greenhouse";
import { detectLinkedInPageType, fillLinkedInEasyApply, submitLinkedInEasyApply } from "./fillers/linkedin";
import { loadWorkerProfileFromEnv, type WorkerProfile } from "./profile";
import { detectCaptcha } from "./captcha";
import type { QueueJob, WorkerConfig } from "./types";

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(
  job: QueueJob,
  api: AppOsApi,
  browser: BrowserManager,
  profile: WorkerProfile,
): Promise<void> {
  const jobUrl = job.job.url;
  if (!jobUrl) {
    log(`⏭ Job ${job.id} has no URL — skipping`);
    await api.updateQueueItem(job.id, {
      status: "FAILED",
      errorMessage: "No job URL stored in application-os",
    });
    return;
  }

  log(`🔵 Processing: ${job.job.title} @ ${job.job.company} (${jobUrl})`);

  // Mark as in progress
  await api.updateQueueItem(job.id, { status: "IN_PROGRESS" });

  let page;
  try {
    page = await browser.newPage();

    // Navigate to the job page
    log(`  → Navigating to ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500); // Let the page settle

    // Detect platform
    const url = page.url();
    if (job.provider === "greenhouse" || url.includes("greenhouse.io")) {
      log(`  → Greenhouse page detected`);
      const result = await fillAndSubmitGreenhouseApplication(page, {
        email: profile.email,
        phone: profile.phone,
        resumePath: profile.resumePath,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
        country: profile.country,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
      });

      if (result.captchaDetected) {
        log(`  ⚠️ Greenhouse CAPTCHA detected — pausing for human-in-the-loop`);
        const verificationToken = nanoid();
        await api.updateQueueItem(job.id, {
          status: "NEEDS_VERIFICATION",
          verificationToken,
          errorMessage: result.errorMessage,
        });
        await page.close();
        return;
      }

      if (result.submitted) {
        log(`  ✅ Greenhouse application submitted successfully`);
        await api.updateQueueItem(job.id, {
          status: "COMPLETED",
          applicationId: result.applicationUrl,
        });
      } else if (result.success) {
        log(`  ⚠️ Greenhouse flow succeeded without final confirmation: ${result.errorMessage}`);
        const verificationToken = nanoid();
        await api.updateQueueItem(job.id, {
          status: "NEEDS_VERIFICATION",
          verificationToken,
          errorMessage: result.errorMessage ?? "Greenhouse needs final manual confirmation",
        });
      } else {
        log(`  ⚠️ Greenhouse needs manual help: ${result.errorMessage}`);
        const verificationToken = nanoid();
        await api.updateQueueItem(job.id, {
          status: "NEEDS_VERIFICATION",
          verificationToken,
          errorMessage: result.errorMessage ?? "Greenhouse application needs manual input",
        });
      }
    } else if (url.includes("linkedin.com")) {
      const pageType = await detectLinkedInPageType(page);
      log(`  → LinkedIn page type: ${pageType}`);

      if (pageType === "easy_apply") {
        const fillResult = await fillLinkedInEasyApply(page, {
          email: profile.email,
          phone: profile.phone,
          resumePath: profile.resumePath,
        });

        if (fillResult.captchaDetected) {
          log(`  ⚠️ CAPTCHA detected (${fillResult.captchaType}) — pausing for human-in-the-loop`);
          const verificationToken = nanoid();
          await api.updateQueueItem(job.id, {
            status: "NEEDS_VERIFICATION",
            verificationToken,
            errorMessage: fillResult.errorMessage,
          });
          await page.close();
          return;
        }

        if (fillResult.success) {
          // Try to submit (will pause if CAPTCHA appears at submit time)
          const submitResult = await submitLinkedInEasyApply(page);
          if (submitResult.captchaDetected) {
            log(`  ⚠️ CAPTCHA at submit time — pausing for human`);
            const verificationToken = nanoid();
            await api.updateQueueItem(job.id, {
              status: "NEEDS_VERIFICATION",
              verificationToken,
              errorMessage: submitResult.errorMessage,
            });
            await page.close();
            return;
          }

          if (submitResult.submitted) {
            log(`  ✅ Submitted successfully`);
            await api.updateQueueItem(job.id, {
              status: "COMPLETED",
              applicationId: submitResult.applicationUrl,
            });
          } else {
            log(`  ⚠️ Form filled but not submitted: ${submitResult.errorMessage}`);
            const verificationToken = nanoid();
            await api.updateQueueItem(job.id, {
              status: "NEEDS_VERIFICATION",
              verificationToken,
              errorMessage: submitResult.errorMessage ?? "Form filled, needs manual review",
            });
          }
        } else {
          log(`  ❌ Fill failed: ${fillResult.errorMessage}`);
          await api.updateQueueItem(job.id, {
            status: "FAILED",
            errorMessage: fillResult.errorMessage,
          });
        }
      } else if (pageType === "external") {
        log(`  🔗 External application — opening link for user`);
        const verificationToken = nanoid();
        await api.updateQueueItem(job.id, {
          status: "NEEDS_VERIFICATION",
          verificationToken,
          errorMessage: "External application (not Easy Apply) — please apply manually",
        });
      } else {
        log(`  ⚠️ Unknown LinkedIn page type`);
        await api.updateQueueItem(job.id, {
          status: "FAILED",
          errorMessage: "Could not determine LinkedIn page type",
        });
      }
    } else if (url.includes("indeed.com")) {
      // Indeed support — similar structure
      log(`  → Indeed detected — opening for manual verification`);
      const verificationToken = nanoid();
      await api.updateQueueItem(job.id, {
        status: "NEEDS_VERIFICATION",
        verificationToken,
        errorMessage: "Indeed job — please complete manually",
      });
    } else {
      log(`  ⚠️ Unknown job board — pausing for human verification`);
      const verificationToken = nanoid();
      await api.updateQueueItem(job.id, {
        status: "NEEDS_VERIFICATION",
        verificationToken,
        errorMessage: `Unrecognized job board: ${url}`,
      });
    }

    await page.close();
  } catch (err) {
    log(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    if (page) await page.close().catch(() => {});
    await api.updateQueueItem(job.id, {
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

async function main(): Promise<void> {
  const config: WorkerConfig = {
    appOsUrl: process.env.AUTO_APPLY_APP_OS_URL ?? "http://localhost:3000",
    workerSecret: process.env.AUTO_APPLY_WORKER_SECRET ?? "",
    userId: process.env.AUTO_APPLY_USER_ID ?? "",
    delayBetweenApplications: parseInt(process.env.AUTO_APPLY_DELAY_MS ?? "5000", 10),
    headless: process.env.AUTO_APPLY_HEADLESS !== "false",
    captchaPauseEnabled: true,
  };

  if (!config.workerSecret) {
    console.error("[Worker] ERROR: AUTO_APPLY_WORKER_SECRET is not set");
    process.exit(1);
  }
  if (!config.userId) {
    console.error("[Worker] ERROR: AUTO_APPLY_USER_ID is not set");
    process.exit(1);
  }

  log(`🚀 Auto-Apply Worker starting`);
  log(`   App OS: ${config.appOsUrl}`);
  log(`   User: ${config.userId}`);
  log(`   Headless: ${config.headless}`);
  log(`   Delay between jobs: ${config.delayBetweenApplications}ms`);

  const workerProfile = loadWorkerProfileFromEnv();

  const api = new AppOsApi(config);
  const browser = new BrowserManager(config);

  // Launch browser once and reuse it
  await browser.launch();

  let linkedInSessionChecked = false;
  let pollCount = 0;
  let running = true;

  const shutdown = async () => {
    log("🛑 Shutdown signal received — finishing current job...");
    running = false;
    await browser.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    pollCount++;
    try {
      const { pending, queueStats } = await api.getQueue();
      log(`📋 Poll #${pollCount}: ${queueStats.pending} pending, ${queueStats.needsVerification} need verification, ${queueStats.completed} completed, ${queueStats.failed} failed`);

      if (pending.length > 0) {
        const hasLinkedInJobs = pending.some((job) => {
          const url = job.job.url ?? "";
          return job.provider === "linkedin" || url.includes("linkedin.com");
        });

        if (hasLinkedInJobs && !linkedInSessionChecked) {
          console.log("[Worker] Checking LinkedIn session...");
          const sessionReady = await browser.ensureLinkedInSession();
          if (!sessionReady) {
            log("❌ LinkedIn session not ready — LinkedIn jobs cannot be processed yet.");
            await sleep(30000);
            continue;
          }
          linkedInSessionChecked = true;
        }

        for (const job of pending) {
          if (!running) break;
          await processJob(job, api, browser, workerProfile);
          if (running) await sleep(config.delayBetweenApplications);
        }
      } else {
        // No pending jobs — wait before polling again
        await sleep(15000);
      }
    } catch (err) {
      log(`❌ Poll error: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(30000); // Back off on error
    }
  }

  await browser.close();
  log("✅ Worker shutdown complete");
}

main().catch((err) => {
  console.error("[Worker] Fatal error:", err);
  process.exit(1);
});
