import type { AppDatabase } from '../db/database.ts';
import type { SessionManager } from './session-manager.ts';
import type { FlowProvider, GenerationProgress, GenerationResult } from './providers/provider.interface.ts';
import type { Job, Session, QueueStats } from '../../shared/types.ts';

export interface QueueEvents {
  onJobUpdated?: (job: Job) => void;
  onStatsUpdated?: (stats: QueueStats) => void;
  onSessionUpdated?: (session: Session) => void;
  onNotification?: (notification: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void;
}

export class JobQueue {
  private db: AppDatabase;
  private sessionManager: SessionManager;
  private mockProvider: FlowProvider;
  private flowAdapter: FlowProvider;
  private events: QueueEvents;
  private isRunning: boolean = true;
  private loopTimer: NodeJS.Timeout | null = null;
  private activeJobs: Set<string> = new Set();
  private busySessions: Set<string> = new Set();

  constructor(
    db: AppDatabase,
    sessionManager: SessionManager,
    mockProvider: FlowProvider,
    flowAdapter: FlowProvider,
    events: QueueEvents = {},
    autoStartLoop: boolean = true
  ) {
    this.db = db;
    this.sessionManager = sessionManager;
    this.mockProvider = mockProvider;
    this.flowAdapter = flowAdapter;
    this.events = events;

    if (autoStartLoop) {
      this.startLoop();
    }
  }

  public setEvents(events: QueueEvents) {
    this.events = events;
  }

  public startQueue() {
    this.isRunning = true;
    this.processQueue();
    this.emitStats();
  }

  public pauseQueue() {
    this.isRunning = false;
    if ('closeActiveSession' in (this.flowAdapter as any)) {
      (this.flowAdapter as any).closeActiveSession();
    }
    this.emitStats();
  }

  public resumeQueue() {
    this.isRunning = true;
    this.processQueue();
    this.emitStats();
  }

  public isQueueRunning(): boolean {
    return this.isRunning;
  }

  public clearAllJobs() {
    this.activeJobs.clear();
    this.busySessions.clear();
    if ('closeActiveSession' in (this.flowAdapter as any)) {
      (this.flowAdapter as any).closeActiveSession();
    }
    this.db.clearAllJobs();
    this.emitStats();
  }

  private startLoop() {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = setInterval(() => {
      if (this.isRunning) {
        this.processQueue();
      }
    }, 1000);
  }

  public stopLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if ('closeActiveSession' in (this.flowAdapter as any)) {
      (this.flowAdapter as any).closeActiveSession();
    }
  }

  public async processQueue() {
    if (!this.isRunning || !this.db.isOpen()) return;

    const settings = this.db.getSettings();
    const concurrencyLimit = settings.concurrencyLimit || 1;

    if (this.activeJobs.size >= concurrencyLimit) {
      return;
    }

    const allJobs = this.db.getJobs();
    const pendingJobs = allJobs
      .filter((j) => j.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (pendingJobs.length === 0) {
      if (this.activeJobs.size === 0 && 'closeActiveSession' in (this.flowAdapter as any)) {
        (this.flowAdapter as any).closeActiveSession();
      }
      return;
    }

    const allSessions = this.db.getSessions();

    for (const job of pendingJobs) {
      if (this.activeJobs.size >= concurrencyLimit) break;
      if (this.activeJobs.has(job.id)) continue;

      // Check dependency resolution
      if (job.dependencyJobId) {
        const parent = this.db.getJobById(job.dependencyJobId);
        if (!parent) {
          this.failJob(job, 'Không tìm thấy tác vụ phụ thuộc.');
          continue;
        }

        if (parent.status === 'failed' || parent.status === 'cancelled' || parent.status === 'interrupted') {
          this.failJob(job, `Tác vụ phụ thuộc đã thất bại với trạng thái: ${parent.status}`);
          continue;
        }

        // Parent requires approval before video generation
        if (parent.status === 'waiting_for_user') {
          // Waiting for user review
          continue;
        }

        if (parent.status !== 'completed') {
          // Parent is still running or pending
          continue;
        }

        // Parent completed: verify output exists
        if (!parent.outputFile) {
          this.failJob(job, 'Tác vụ phụ thuộc đã hoàn thành nhưng không tìm thấy tệp kết quả hợp lệ.');
          continue;
        }

        // Pass reference image from parent output if not already set
        if (!job.referenceImageUrl) {
          this.db.updateJob(job.id, { referenceImageUrl: parent.outputFile });
          job.referenceImageUrl = parent.outputFile;
        }
      }

      // Find available session
      const availableSession = this.findAvailableSession(job, allSessions);
      if (!availableSession) {
        // No session available right now
        continue;
      }

      // Claim job and session
      this.activeJobs.add(job.id);
      this.busySessions.add(availableSession.id);

      // Execute asynchronously
      this.executeJob(job, availableSession).finally(() => {
        this.activeJobs.delete(job.id);
        this.busySessions.delete(availableSession.id);
        if (this.db.isOpen()) {
          this.processQueue();
          this.emitStats();
        }
      });
    }
  }

  private findAvailableSession(job: Job, sessions: Session[]): Session | undefined {
    // If job has a specific session requested
    if (job.sessionId) {
      const s = sessions.find((item) => item.id === job.sessionId);
      if (s && s.status === 'ready' && !this.busySessions.has(s.id)) {
        return s;
      }
      return undefined;
    }

    // Default: find any ready session not busy
    return sessions.find((s) => s.status === 'ready' && !this.busySessions.has(s.id));
  }

  private async executeJob(job: Job, session: Session) {
    const settings = this.db.getSettings();
    const provider = settings.simulationMode ? this.mockProvider : this.flowAdapter;

    // In real mode: ensure any interactive browser opened via "Mở trình duyệt" is closed before worker runs
    if (!settings.simulationMode && this.sessionManager.isBrowserOpen(session.id)) {
      console.log(`[JobQueue] Đang đóng cửa sổ trình duyệt thủ công của phiên "${session.name}" trước khi chạy tác vụ...`);
      await this.sessionManager.closeBrowser(session.id);
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Update job to running
    const updatedJob = this.db.updateJob(job.id, {
      status: 'running',
      progress: 5,
      sessionId: session.id,
      errorMessage: undefined,
    })!;

    this.emitJob(updatedJob);
    this.emitStats();

    // Restore batch project URL from sibling jobs if needed
    if (job.type === 'image' && job.metadata?.batchId && 'getBatchProjectUrl' in (provider as any)) {
      const adapter = provider as any;
      if (!adapter.getBatchProjectUrl(job.metadata.batchId)) {
        const sibling = this.db.getJobs().find(
          (j) => j.metadata?.batchId === job.metadata?.batchId && j.metadata?.flowProjectUrl
        );
        if (sibling?.metadata?.flowProjectUrl) {
          adapter.setBatchProjectUrl(job.metadata.batchId, sibling.metadata.flowProjectUrl);
        }
      }
    }

    try {
      const result = await provider.generate(
        updatedJob,
        session,
        (progress: GenerationProgress) => {
          const current = this.db.getJobById(job.id);
          if (current && (current.status === 'running' || current.status === 'downloading')) {
            const nextStatus = progress.stage === 'downloading' ? 'downloading' : 'running';
            const j = this.db.updateJob(job.id, {
              status: nextStatus,
              progress: progress.progress,
            });
            if (j) this.emitJob(j);
          }
        }
      );

      const flowProjectUrl = result.metadata?.flowProjectUrl;
      const metadataUpdates = flowProjectUrl ? { flowProjectUrl } : {};

      if (result.success && result.outputFile) {
        // Check if user approval is required (for Image in Image -> Video workflow)
        if (job.requiresApproval && !job.approvedByUser) {
          const completedJob = this.db.updateJob(job.id, {
            status: 'waiting_for_user',
            progress: 100,
            outputFile: result.outputFile,
            thumbnailFile: result.thumbnailFile,
            completedAt: new Date().toISOString(),
            metadata: {
              ...(job.metadata || {}),
              ...metadataUpdates,
            },
          })!;
          this.emitJob(completedJob);
          this.emitNotification({
            type: 'info',
            message: `Ảnh đã sẵn sàng để xem xét: "${job.name}". Vui lòng phê duyệt để tiếp tục tạo video.`,
          });
        } else {
          const completedJob = this.db.updateJob(job.id, {
            status: 'completed',
            progress: 100,
            outputFile: result.outputFile,
            thumbnailFile: result.thumbnailFile,
            completedAt: new Date().toISOString(),
            metadata: {
              ...(job.metadata || {}),
              ...metadataUpdates,
            },
          })!;
          this.emitJob(completedJob);
          this.emitNotification({
            type: 'success',
            message: `Tác vụ đã hoàn thành: "${job.name}" (${job.type})`,
          });
        }
      } else {
        await this.handleJobFailure(job, session, result);
      }
    } catch (err: any) {
      await this.handleJobFailure(job, session, {
        success: false,
        error: err.message || String(err),
        isTransient: true,
      });
    }
  }

  private async handleJobFailure(job: Job, session: Session, result: GenerationResult) {
    const errorMsg = result.error || 'Lỗi tạo nội dung không xác định';

    // 1. Quota Exhausted: STOP session, do not retry!
    if (result.isQuotaExhausted) {
      this.sessionManager.updateStatus(session.id, 'quota_exhausted', errorMsg);
      const updatedSession = this.sessionManager.getSessionById(session.id);
      if (updatedSession) this.emitSession(updatedSession);

      const failedJob = this.db.updateJob(job.id, {
        status: 'failed',
        errorMessage: `Hết hạn ngạch quota: ${errorMsg}. Worker đã dừng.`,
      })!;
      this.emitJob(failedJob);

      this.emitNotification({
        type: 'error',
        message: `Hết hạn ngạch quota cho phiên "${session.name}". Worker đã dừng.`,
      });
      return;
    }

    // 2. Auth Required: STOP session, do not retry!
    if (result.isAuthRequired) {
      this.sessionManager.updateStatus(session.id, 'auth_required', errorMsg);
      const updatedSession = this.sessionManager.getSessionById(session.id);
      if (updatedSession) this.emitSession(updatedSession);

      const pausedJob = this.db.updateJob(job.id, {
        status: 'failed',
        errorMessage: `Yêu cầu xác thực đăng nhập: ${errorMsg}. Vui lòng đăng nhập qua tab Phiên làm việc.`,
      })!;
      this.emitJob(pausedJob);

      this.emitNotification({
        type: 'warning',
        message: `Yêu cầu đăng nhập tài khoản cho phiên "${session.name}". Worker đã dừng.`,
      });
      return;
    }

    // 3. Transient Error: Retry with exponential backoff if retryCount < maxRetries and isTransient is true
    const isTransient = result.isTransient !== false;
    const nextRetry = (job.retryCount || 0) + 1;
    if (isTransient && nextRetry <= job.maxRetries) {
      const delayMs = Math.pow(2, nextRetry - 1) * 2500;
      console.log(`[JobQueue] Lỗi tạm thời ở job ${job.id}. Lần thử ${nextRetry}/${job.maxRetries}. Đang thử lại sau ${delayMs}ms...`);

      const retryingJob = this.db.updateJob(job.id, {
        status: 'pending',
        retryCount: nextRetry,
        errorMessage: `Lần thử ${nextRetry}/${job.maxRetries} thất bại: ${errorMsg}. Thử lại sau ${Math.round(delayMs / 1000)} giây...`,
      })!;
      this.emitJob(retryingJob);

      this.emitNotification({
        type: 'warning',
        message: `Tác vụ "${job.name}" thất bại: ${errorMsg}. Đang thử lại (lần ${nextRetry}/${job.maxRetries})...`,
      });
      return;
    }

    // 4. Exceeded max retries or non-transient error: mark as failed
    const failedJob = this.db.updateJob(job.id, {
      status: 'failed',
      errorMessage: isTransient ? `Thất bại sau ${job.maxRetries} lần thử: ${errorMsg}` : errorMsg,
    })!;
    this.emitJob(failedJob);

    this.emitNotification({
      type: 'error',
      message: `Tác vụ thất bại: "${job.name}" (${errorMsg})`,
    });
  }

  private failJob(job: Job, reason: string) {
    const j = this.db.updateJob(job.id, {
      status: 'failed',
      errorMessage: reason,
    });
    if (j) this.emitJob(j);
    this.emitNotification({
      type: 'error',
      message: `Tác vụ "${job.name}" thất bại: ${reason}`,
    });
  }

  public approveJob(jobId: string) {
    const job = this.db.getJobById(jobId);
    if (!job) return;

    const updated = this.db.updateJob(jobId, {
      status: 'completed',
      approvedByUser: true,
    });

    if (updated) {
      this.emitJob(updated);
      this.emitNotification({
        type: 'success',
        message: `Đã duyệt ảnh cho "${job.name}". Tác vụ video liên quan hiện có thể tiến hành.`,
      });
      this.processQueue();
    }
  }

  public retryJob(jobId: string) {
    const updated = this.db.updateJob(jobId, {
      status: 'pending',
      retryCount: 0,
      errorMessage: undefined,
      progress: 0,
    });
    if (updated) {
      this.emitJob(updated);
      this.processQueue();
    }
  }

  public cancelJob(jobId: string) {
    const updated = this.db.updateJob(jobId, {
      status: 'cancelled',
      errorMessage: 'Đã hủy bởi người dùng',
    });
    if (updated) {
      this.emitJob(updated);
      this.activeJobs.delete(jobId);
    }
  }

  private emitJob(job: Job) {
    this.events.onJobUpdated?.(job);
  }

  private emitSession(session: Session) {
    this.events.onSessionUpdated?.(session);
  }

  private emitStats() {
    const stats = this.db.getStats();
    this.events.onStatsUpdated?.(stats);
  }

  private emitNotification(notification: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) {
    this.events.onNotification?.(notification);
  }
}
