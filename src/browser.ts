import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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

  private isClosedTargetError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Target page, context or browser has been closed") ||
      message.includes("Browser has been closed") ||
      message.includes("Context closed")
    );
  }

  private async createContext(): Promise<void> {
    if (!this.browser) {
      throw new Error("[Browser] Cannot create context before browser launch");
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    this.context.on("close", () => {
      console.warn("[Browser] Context closed");
      this.context = null;
    });
  }

  async launch(): Promise<void> {
    if (this.browser && this.context) return;

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

    this.browser.on("disconnected", () => {
      console.warn("[Browser] Chromium disconnected unexpectedly");
      this.browser = null;
      this.context = null;
    });

    await this.createContext();
    console.log("[Browser] Chromium launched and context ready");
  }

  private async relaunch(): Promise<void> {
    console.warn("[Browser] Relaunching Chromium after unexpected closure...");
    await this.close();
    await this.launch();
  }

  async ensureLinkedInSession(): Promise<boolean> {
    if (!this.context) await this.launch();
    return ensureLinkedInLogin(this.context!, this.sessionStore, this.config.userId);
  }

  async newPage(): Promise<Page> {
    if (!this.context) await this.launch();

    try {
      return await this.context!.newPage();
    } catch (error) {
      if (!this.isClosedTargetError(error)) {
        throw error;
      }

      console.warn("[Browser] newPage failed because browser/context was closed, retrying once...");
      await this.relaunch();
      return this.context!.newPage();
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    console.log("[Browser] Closed");
  }

  isReady(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
