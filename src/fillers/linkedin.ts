import type { Page } from "playwright";
import { detectCaptcha } from "../captcha";

export interface LinkedInProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  resumePath?: string;
  linkedinUrl?: string;
  location?: string;
  workAuth?: string; // e.g., "H1B", "OPT", "Citizen"
}

export interface FillResult {
  success: boolean;
  errorMessage?: string;
  captchaDetected: boolean;
  captchaType?: string;
  submitted: boolean;
  applicationUrl?: string;
}

/**
 * Detect which type of LinkedIn job page we're on.
 */
export async function detectLinkedInPageType(page: Page): Promise<"easy_apply" | "external" | "unknown"> {
  const url = page.url();

  if (url.includes("linkedin.com/jobs/view")) {
    // Check for Easy Apply button
    const easyApplyBtn = await page.$(
      'button[data-control-name="apply_undefined"], .jobs-apply-button, [aria-label*="Easy Apply"]',
    );
    if (easyApplyBtn) return "easy_apply";

    const applyBtn = await page.$(
      'a[data-control-name="apply_top_card"]',
    );
    if (applyBtn) return "external";

    return "unknown";
  }

  return "unknown";
}

/**
 * Fill a LinkedIn Easy Apply form.
 * LinkedIn Easy Apply forms have multiple steps (pages within the modal).
 */
export async function fillLinkedInEasyApply(
  page: Page,
  profile: LinkedInProfileData,
): Promise<FillResult> {
  try {
    // Wait for the Easy Apply modal/form to load
    await page.waitForSelector(
      '.jobs-easy-apply-content, .artdeco-modal, .fb-form-grid',
      { timeout: 10000 },
    ).catch(() => null);

    // Check for CAPTCHA first
    const captcha = await detectCaptcha(page);
    if (captcha.found) {
      return {
        success: false,
        captchaDetected: true,
        captchaType: captcha.type,
        submitted: false,
        errorMessage: captcha.description,
      };
    }

    // Fill in standard Easy Apply fields
    // LinkedIn Easy Apply uses standard form fields with predictable names/ids

    const fieldMappings: Array<{
      selector: string;
      value: string | undefined;
      fillStrategy: "fill" | "select" | "check";
    }> = [
      // Email
      {
        selector: 'input[name="email"], input[id="email"]',
        value: profile.email,
        fillStrategy: "fill",
      },
      // Phone
      {
        selector: 'input[name="phoneNumber"], input[id="phoneNumber"], input[type="tel"]',
        value: profile.phone,
        fillStrategy: "fill",
      },
      // LinkedIn URL
      {
        selector: 'input[name="linkedinUrl"], input[id="linkedinUrl"]',
        value: profile.linkedinUrl,
        fillStrategy: "fill",
      },
      // Location
      {
        selector: 'input[name="location"], input[id="location"]',
        value: profile.location,
        fillStrategy: "fill",
      },
    ];

    for (const field of fieldMappings) {
      if (!field.value) continue;

      const el = await page.$(field.selector);
      if (!el) continue;

      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      if (field.fillStrategy === "fill") {
        await el.click({ clickCount: 3 }); // select all
        await el.fill(field.value);
      } else if (field.fillStrategy === "check") {
        await el.check();
      }
    }

    // Handle file upload for resume if present
    if (profile.resumePath) {
      const resumeInput = await page.$(
        'input[type="file"], input[name="resume"]',
      );
      if (resumeInput) {
        const isVisible = await resumeInput.isVisible().catch(() => false);
        if (isVisible) {
          await resumeInput.setInputFiles(profile.resumePath);
        }
      }
    }

    // Click through the next button if present (Easy Apply is multi-step)
    let maxSteps = 10;
    while (maxSteps-- > 0) {
      // Check for CAPTCHA before advancing
      const captchaCheck = await detectCaptcha(page);
      if (captchaCheck.found) {
        return {
          success: false,
          captchaDetected: true,
          captchaType: captchaCheck.type,
          submitted: false,
          errorMessage: `CAPTCHA detected at step ${10 - maxSteps}: ${captchaCheck.description}`,
        };
      }

      // Look for Next/Continue button
      const nextBtn = await page.$(
        'button[aria-label*="Continue"], button[aria-label*="Next"], .artdeco-button--primary',
      );
      if (!nextBtn) break;

      const nextText = (await nextBtn.textContent().catch(() => "")) ?? "";
      const isDisabled = await nextBtn.isDisabled().catch(() => false);

      if (isDisabled) break;
      if (nextText.toLowerCase().includes("review") || nextText.toLowerCase().includes("submit")) {
        break; // Don't auto-advance to review/submit
      }

      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    return {
      success: true,
      captchaDetected: false,
      submitted: false, // Not submitted yet — stopped at review page for human-in-the-loop
      errorMessage: "Form filled, stopped at review step for human verification",
    };
  } catch (err) {
    return {
      success: false,
      captchaDetected: false,
      submitted: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error filling LinkedIn form",
    };
  }
}

/**
 * Attempt to submit a LinkedIn Easy Apply form (final step).
 */
export async function submitLinkedInEasyApply(page: Page): Promise<FillResult> {
  try {
    // Check CAPTCHA before submitting
    const captcha = await detectCaptcha(page);
    if (captcha.found) {
      return {
        success: false,
        captchaDetected: true,
        captchaType: captcha.type,
        submitted: false,
        errorMessage: captcha.description,
      };
    }

    // Look for the final submit button
    const submitBtn = await page.$(
      'button[aria-label*="Submit application"], button[data-control-name="submit"], .artdeco-button--primary[type="submit"]',
    );
    if (!submitBtn) {
      return {
        success: false,
        captchaDetected: false,
        submitted: false,
        errorMessage: "Could not find submit button",
      };
    }

    await submitBtn.click();
    await page.waitForTimeout(2000); // Wait for confirmation page

    const url = page.url();
    const isConfirmation = url.includes("confirm") || url.includes("thanked");

    return {
      success: isConfirmation,
      captchaDetected: false,
      submitted: isConfirmation,
      applicationUrl: url,
      errorMessage: isConfirmation ? undefined : "Form submitted but confirmation not detected",
    };
  } catch (err) {
    return {
      success: false,
      captchaDetected: false,
      submitted: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error submitting form",
    };
  }
}
