import { chromium, type Browser, type BrowserContext } from "playwright";
import type { WorkerConfig } from "./types";
import { FileSessionStore, ensureLinkedInLogin } from "./session-store";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: WorkerConfig;
  private sessionStore: FileSessionStore;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.sessionStore = new FileSessionStore();
  }

  async launch(): Promise<void> {
    if (this.browser) return;

    console.log("[Browser] Launching Chromium...");
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    console.log("[Browser] Chromium launched and context ready");
  }

  async ensureLinkedInSession(): Promise<boolean> {
    if (!this.context) await this.launch();
    return ensureLinkedInLogin(this.context!, this.sessionStore, this.config.userId);
  }

  async newPage() {
    if (!this.context) await this.launch();
    return this.context!.newPage();
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log("[Browser] Closed");
  }

  isReady(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
