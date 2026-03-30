export type QueueItemStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "NEEDS_VERIFICATION"
  | "COMPLETED"
  | "FAILED";

export interface QueueJob {
  id: string;
  userId: string;
  jobId: string;
  status: QueueItemStatus;
  runLogId?: string;
  applicationId?: string;
  errorMessage?: string;
  provider?: string;
  verificationToken?: string;
  createdAt: string;
  updatedAt: string;
  job: {
    id: string;
    company: string;
    title: string;
    url?: string;
  };
}

export interface QueueStats {
  total: number;
  pending: number;
  inProgress: number;
  needsVerification: number;
  completed: number;
  failed: number;
}

export interface WorkerConfig {
  appOsUrl: string;
  workerSecret: string;
  userId: string;
  delayBetweenApplications: number; // ms
  headless: boolean;
  captchaPauseEnabled: boolean;
}
