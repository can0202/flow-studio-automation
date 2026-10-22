export type JobStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_user'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'interrupted';

export type JobType = 'image' | 'video';
export type ProviderType = 'nano_banana' | 'veo_3';

export type SessionStatus =
  | 'ready'
  | 'busy'
  | 'auth_required'
  | 'quota_exhausted'
  | 'disabled'
  | 'paused';

export const JOB_STATUS_NAMES: Record<JobStatus, string> = {
  pending: 'Đang chờ',
  running: 'Đang chạy',
  downloading: 'Đang tải về',
  waiting_for_user: 'Chờ duyệt',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  paused: 'Tạm dừng',
  cancelled: 'Đã hủy',
  interrupted: 'Bị ngắt',
};

export const SESSION_STATUS_NAMES: Record<SessionStatus, string> = {
  ready: 'Sẵn sàng',
  busy: 'Bận (Đang chạy)',
  auth_required: 'Cần xác thực',
  quota_exhausted: 'Hết Quota',
  disabled: 'Vô hiệu hóa',
  paused: 'Tạm dừng',
};

export interface Job {
  id: string;
  name: string;
  type: JobType;
  provider: ProviderType;
  prompt: string;
  model: string;
  aspectRatio: string;
  duration?: number;
  referenceImageUrl?: string;
  dependencyJobId?: string;
  requiresApproval?: boolean;
  approvedByUser?: boolean;
  status: JobStatus;
  progress: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  outputFile?: string;
  thumbnailFile?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Session {
  id: string;
  name: string;
  profileDir: string;
  status: SessionStatus;
  lastCheckedAt?: string;
  notes?: string;
  activeJobId?: string;
  createdAt: string;
}

export interface Settings {
  concurrencyLimit: number;
  defaultMaxRetries: number;
  outputDir: string;
  simulationMode: boolean;
  defaultProjectName: string;
  flowUrl: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  waiting_for_user: number;
  completed: number;
  failed: number;
  interrupted: number;
  paused: number;
  activeSessions: number;
  attentionSessions: number;
}

export interface OutputFileItem {
  id: string;
  jobId: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  size: number;
  createdAt: string;
  projectName: string;
  prompt: string;
  metadataPath?: string;
}

export interface CreateJobInput {
  name?: string;
  type: JobType;
  provider?: ProviderType;
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  referenceImageUrl?: string;
  dependencyJobId?: string;
  requiresApproval?: boolean;
  maxRetries?: number;
  projectName?: string;
  sessionId?: string;
  repeatCount?: number; // Web generation multiplier: 1, 2, 3, 4 (x1, x2, x3, x4)
  metadata?: Record<string, any>;
}

export interface BatchImportItem {
  prompt: string;
  type?: JobType;
  aspectRatio?: string;
  duration?: number;
  model?: string;
  referenceImageUrl?: string;
  repeatCount?: number;
}

export interface BatchNamingConfig {
  prefix?: string;
  pattern: 'prefix_index' | 'project_index' | 'prefix_date_index' | 'date_index' | 'custom';
  customPattern?: string;
  startNumber: number;
  digits: number;
  separator?: string;
}

export interface DiscoveredProject {
  name: string;
  url?: string;
}

export interface SyncMediaOptions {
  sessionId?: string;
  scope: 'all_projects' | 'current_project';
  targetProjectName?: string;
  selectedProjectNames?: string[]; // If set, only sync these projects (subset of all_projects)
  namingConfig: BatchNamingConfig;
}

export interface SyncProgress {
  status: 'scanning' | 'downloading' | 'completed' | 'cancelled' | 'error';
  currentProject?: string;
  currentFile?: string;
  downloadedCount: number;
  skippedCount: number;
  totalFound: number;
  message?: string;
}

export interface BatchRenameOptions {
  projectName?: string;
  fileIds?: string[];
  namingConfig: BatchNamingConfig;
}

export interface IElectronAPI {
  // App & settings
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
  getStats: () => Promise<QueueStats>;
  selectFolder: () => Promise<string | null>;

  // Sessions
  getSessions: () => Promise<Session[]>;
  addSession: (name: string) => Promise<Session>;
  openSessionBrowser: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  testSessionConnection: (sessionId: string) => Promise<{ success: boolean; status: SessionStatus; message: string }>;
  updateSessionStatus: (sessionId: string, status: SessionStatus) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;

  // Jobs
  getJobs: () => Promise<Job[]>;
  createJob: (input: CreateJobInput) => Promise<Job>;
  createBatchJobs: (inputs: CreateJobInput[]) => Promise<Job[]>;
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  approveJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  clearCompletedJobs: () => Promise<void>;
  clearAllJobs: () => Promise<void>;
  retryFailedJobs: () => Promise<void>;

  // Queue
  startQueue: () => Promise<void>;
  pauseQueue: () => Promise<void>;
  resumeQueue: () => Promise<void>;
  isQueueRunning: () => Promise<boolean>;

  // Outputs
  getOutputs: (projectName?: string) => Promise<OutputFileItem[]>;
  openFile: (filePath: string) => Promise<void>;
  revealInExplorer: (filePath: string) => Promise<void>;
  readAsDataUrl: (filePath: string) => Promise<string | null>;
  batchRenameOutputs: (options: BatchRenameOptions) => Promise<{ success: boolean; renamedCount: number; message: string }>;
  deleteOutput: (filePath: string) => Promise<boolean>;
  deleteOutputs: (filePaths: string[]) => Promise<{ success: boolean; deletedCount: number }>;

  // Media Sync
  startMediaSync: (options: SyncMediaOptions) => Promise<{ success: boolean; downloaded: number; skipped: number; message: string }>;
  cancelMediaSync: () => Promise<void>;
  scanProjects: (sessionId?: string) => Promise<{ success: boolean; projects: DiscoveredProject[]; message: string }>;

  // Event Listeners
  onQueueStatsUpdated: (callback: (stats: QueueStats) => void) => () => void;
  onJobUpdated: (callback: (job: Job) => void) => () => void;
  onSessionUpdated: (callback: (session: Session) => void) => () => void;
  onNotification: (callback: (notification: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => () => void;
  onSyncProgress: (callback: (progress: SyncProgress) => void) => () => void;
}

declare global {
  interface Window {
    api: IElectronAPI;
  }
}
