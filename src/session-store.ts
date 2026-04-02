import { type BrowserContext, type Cookie } from "playwright";
import * as fs from "fs";
import * as path from "path";

const SESSION_DIR = path.join(__dirname, "..", "sessions");

export interface SessionStore {
  save(context: BrowserContext, platform: string, userId: string): Promise<void>;
  load(platform: string, userId: string): Promise<Cookie[]>;
  hasSession(platform: string, userId: string): boolean;
}

export class FileSessionStore implements SessionStore {
  private sessionPath(platform: string, userId: string): string {
    return path.join(SESSION_DIR, `${platform}_${userId}.json`);
  }

  async save(context: BrowserContext, platform: string, userId: string): Promise<void> {
    const cookies = await context.cookies();
    const storageState = await context.storageState(); // includes localStorage/sessionStorage too

    const dir = SESSION_DIR;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      this.sessionPath(platform, userId),
      JSON.stringify({ cookies, storageState }, null, 2),
    );
    console.log(`[Session] Saved ${cookies.length} cookies for ${platform}/${userId}`);
  }

  async load(platform: string, userId: string): Promise<Cookie[]> {
    const filePath = this.sessionPath(platform, userId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const { cookies } = JSON.parse(raw);
    console.log(`[Session] Loaded ${cookies.length} cookies for ${platform}/${userId}`);
    return cookies as Cookie[];
  }

  hasSession(platform: string, userId: string): boolean {
    return fs.existsSync(this.sessionPath(platform, userId));
  }
}

/**
 * Ensure a context is logged into LinkedIn.
 * If no session exists, opens the browser so the user can log in manually.
 * After login, saves cookies for future runs.
 */
export async function ensureLinkedInLogin(
  context: BrowserContext,
  sessionStore: SessionStore,
  userId: string,
): Promise<boolean> {
  const cookies = await sessionStore.load("linkedin", userId);

  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log("[Session] Restored LinkedIn session from saved cookies");
    return true;
  }

  // No session — open LinkedIn login page for manual login
  console.log("[Session] No saved LinkedIn session — please log in manually in the browser");
  await context.clearCookies();
  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Wait for user to log in (poll for session)
  console.log("[Session] Waiting for you to log into LinkedIn...");
  let loggedIn = false;
  let attempts = 0;

  while (!loggedIn && attempts < 60) {
    // Check every 5 seconds
    await page.waitForTimeout(5000);

    const currentCookies = await context.cookies();
    const hasLiSession = currentCookies.some((c) =>
      c.name.includes("li_at") || c.name.includes("JSESSIONID"),
    );

    if (hasLiSession) {
      loggedIn = true;
      await sessionStore.save(context, "linkedin", userId);
      console.log("[Session] LinkedIn login detected — session saved!");
      await page.close();
      return true;
    }

    attempts++;
    console.log(`[Session] Still waiting for login... (${attempts}/60)`);
  }

  if (!loggedIn) {
    console.error("[Session] Timed out waiting for LinkedIn login");
    await page.close();
    return false;
  }

  return true;
}
