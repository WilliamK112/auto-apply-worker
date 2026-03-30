import type { QueueJob, QueueStats, WorkerConfig } from "./types";

export class AppOsApi {
  constructor(private config: WorkerConfig) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-auto-apply-secret": this.config.workerSecret,
    };
  }

  async getQueue(): Promise<{ pending: QueueJob[]; queueStats: QueueStats }> {
    const url = `${this.config.appOsUrl}/api/auto-apply/worker?userId=${encodeURIComponent(this.config.userId)}`;
    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[AppOsApi] GET /queue failed ${res.status}: ${text}`);
    }

    return res.json() as Promise<{ pending: QueueJob[]; queueStats: QueueStats }>;
  }

  async updateQueueItem(
    queueItemId: string,
    input: {
      status?: "PENDING" | "IN_PROGRESS" | "NEEDS_VERIFICATION" | "COMPLETED" | "FAILED";
      verificationToken?: string;
      errorMessage?: string;
      applicationId?: string;
    },
  ): Promise<{ success: boolean }> {
    const res = await fetch(`${this.config.appOsUrl}/api/auto-apply/worker`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ queueItemId, userId: this.config.userId, ...input }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[AppOsApi] POST update failed ${res.status}: ${text}`);
    }

    return res.json() as Promise<{ success: boolean }>;
  }
}
