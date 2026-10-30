import fs from 'fs';
import type { AppDatabase } from '../db/database.ts';
import type { SessionManager } from './session-manager.ts';
import type { FlowProvider, GenerationProgress, GenerationResult } from './providers/provider.interface.ts';
import type { Job, Session, QueueStats } from '../../shared/types.ts';

export interface QueueEvents {
  onJobUpdated?: (job: Job) => void;
  onStatsUpdated?: (stats: QueueStats) => void;
  onSessionUpdated?: (session: Session) => void;
  onNotification?: (notification: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void;
  onQuotaExhausted?: (data: { sessionId: string; sessionName: string; pendingCount: number; jobName: string }) => void;
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

        // Pass reference image from parent output if not already set (e.g. Image -> Video or Video chaining)
        if (!job.referenceImageUrl) {
          const parentRef = parent.metadata?.lastFrameFile || (parent.type === 'image' ? parent.outputFile : undefined);
          if (parentRef && fs.existsSync(parentRef)) {
            this.db.updateJob(job.id, { referenceImageUrl: parentRef });
            job.referenceImageUrl = parentRef;
            console.log(`[JobQueue] Đã truyền khung hình tham chiếu từ job cha "${parent.name}" sang job "${job.name}": ${parentRef}`);
          } else if (parent.outputFile && fs.existsSync(parent.outputFile)) {
            this.db.updateJob(job.id, { referenceImageUrl: parent.outputFile });
            job.referenceImageUrl = parent.outputFile;
          }
        }

        // Pass session from parent to child to guarantee child runs in the same account/session
        if (!job.sessionId && parent.sessionId) {
          this.db.updateJob(job.id, { sessionId: parent.sessionId });
          job.sessionId = parent.sessionId;
          console.log(`[JobQueue] Gán phiên "${parent.sessionId}" từ job cha sang job con "${job.name}"`);
        }

        // Pass project URL and batchId from parent to child so video generates in the SAME project
        const parentProjectUrl = parent.metadata?.flowProjectUrl;
        const parentBatchId = parent.metadata?.batchId;
        if (parentProjectUrl || parentBatchId) {
          const updatedMeta = {
            ...(job.metadata || {}),
            ...(parentProjectUrl && !job.metadata?.flowProjectUrl ? { flowProjectUrl: parentProjectUrl } : {}),
            ...(parentBatchId && !job.metadata?.batchId ? { batchId: parentBatchId } : {}),
          };
          this.db.updateJob(job.id, { metadata: updatedMeta });
          job.metadata = updatedMeta;
          console.log(`[JobQueue] Đã truyền flowProjectUrl (${parentProjectUrl}) và batchId (${parentBatchId}) từ job cha sang job con "${job.name}"`);
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
    const settings = this.db.getSettings();
    const strictBinding = settings.strictSessionBinding !== false;

    // If job has a specific session requested
    if (job.sessionId) {
      const s = sessions.find((item) => item.id === job.sessionId);
      
      // If target session is ready and not currently busy, use it!
      if (s && s.status === 'ready' && !this.busySessions.has(s.id)) {
        return s;
      }

      // If target session is currently busy with another job, this job MUST WAIT for its turn.
      // Do NOT start another job on the same session (prevent profile lock!)
      // and do NOT switch sessions if strict binding is on!
      if (s && this.busySessions.has(s.id)) {
        return undefined;
      }

      // If target session is not ready (quota_exhausted, auth_required, paused, etc.)
      if (strictBinding) {
        // Strict mode: Never auto-fallback! User must manually transfer or resolve session status.
        return undefined;
      }

      // Fallback only if strict binding is explicitly turned off
      const fallback = sessions.find((item) => item.status === 'ready' && !this.busySessions.has(item.id));
      if (fallback) {
        console.log(`[JobQueue] Phiên chỉ định "${s?.name || job.sessionId}" không sẵn sàng (${s?.status || 'không tồn tại'}). Tự động chuyển giao sang phiên sẵn sàng "${fallback.name}".`);
        return fallback;
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

    // Restore batch project URL from job metadata or sibling jobs if needed
    if (job.metadata?.batchId && 'getBatchProjectUrl' in (provider as any)) {
      const adapter = provider as any;
      if (job.metadata?.flowProjectUrl) {
        adapter.setBatchProjectUrl(job.metadata.batchId, job.metadata.flowProjectUrl);
      } else if (!adapter.getBatchProjectUrl(job.metadata.batchId)) {
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
          const lastFrameFile = result.lastFrameFile || result.metadata?.lastFrameFile;
          const completedJob = this.db.updateJob(job.id, {
            status: 'completed',
            progress: 100,
            outputFile: result.outputFile,
            thumbnailFile: result.thumbnailFile,
            completedAt: new Date().toISOString(),
            metadata: {
              ...(job.metadata || {}),
              ...metadataUpdates,
              ...(lastFrameFile ? { lastFrameFile } : {}),
            },
          })!;
          this.emitJob(completedJob);
          this.emitNotification({
            type: 'success',
            message: `Tác vụ đã hoàn thành: "${job.name}" (${job.type})`,
          });

          // Human-like stealth cooldown between consecutive generations on the same session
          if (!settings.simulationMode) {
            const cooldownMs = 2500 + Math.floor(Math.random() * 2000);
            console.log(`[JobQueue] [Stealth] Giãn cách an toàn ${Math.round(cooldownMs / 1000)}s cho phiên "${session.name}" trước tác vụ tiếp theo...`);
            await new Promise((resolve) => setTimeout(resolve, cooldownMs));
          }
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

    // 1. Quota Exhausted: Immediately pause ALL remaining pending jobs of this session
    //    so the queue loop never picks them up and runs them one-by-one into quota errors.
    if (result.isQuotaExhausted) {
      this.sessionManager.updateStatus(session.id, 'quota_exhausted', errorMsg);
      const updatedSession = this.sessionManager.getSessionById(session.id);
      if (updatedSession) this.emitSession(updatedSession);

      // Cleanly close the browser context of this exhausted session
      if ('closeSessionBatch' in (this.flowAdapter as any)) {
        await (this.flowAdapter as any).closeSessionBatch(session.id);
      }

      // CRITICAL FIX: Bulk-pause ALL pending jobs of this session RIGHT NOW
      // before the queue loop can pick any of them up.
      const pausedCount = this.db.pauseSessionJobs(session.id);

      // Emit each paused job so UI updates immediately
      if (pausedCount > 0) {
        const pausedJobs = this.db.getJobs().filter(
          (j) => j.sessionId === session.id && j.status === 'paused'
        );
        for (const pj of pausedJobs) {
          this.emitJob(pj);
        }
      }

      // Mark the currently-failing job as failed with a descriptive message
      const failedJob = this.db.updateJob(job.id, {
        status: 'failed',
        errorMessage: `Tài khoản "${session.name}" đã hết quota hôm nay. ${pausedCount} tác vụ còn lại đã được tạm dừng — chọn tài khoản khác để chạy tiếp.`,
      })!;
      this.emitJob(failedJob);

      this.emitNotification({
        type: 'warning',
        message: `Tài khoản "${session.name}" hết quota! Đã tạm dừng ${pausedCount} tác vụ còn lại. Vui lòng chọn tài khoản khác để tiếp tục.`,
      });

      // Notify UI to open Quota Confirmation Modal
      if (this.events.onQuotaExhausted) {
        this.events.onQuotaExhausted({
          sessionId: session.id,
          sessionName: session.name,
          pendingCount: pausedCount,
          jobName: job.name,
        });
      }
      return;
    }

    // 1b. Rate Limited / Unusual Activity: Google temporarily throttled this account
    //     Pause remaining jobs safely without falsely marking quota as exhausted!
    if (result.isRateLimited) {
      this.sessionManager.updateStatus(session.id, 'paused', errorMsg);
      const updatedSession = this.sessionManager.getSessionById(session.id);
      if (updatedSession) this.emitSession(updatedSession);

      if ('closeSessionBatch' in (this.flowAdapter as any)) {
        await (this.flowAdapter as any).closeSessionBatch(session.id);
      }

      const pausedCount = this.db.pauseSessionJobs(session.id);
      if (pausedCount > 0) {
        const pausedJobs = this.db.getJobs().filter(
          (j) => j.sessionId === session.id && j.status === 'paused'
        );
        for (const pj of pausedJobs) {
          this.emitJob(pj);
        }
      }

      const failedJob = this.db.updateJob(job.id, {
        status: 'failed',
        errorMessage: `Tài khoản "${session.name}" bị Google tạm giới hạn do yêu cầu quá nhanh. Đã tạm dừng ${pausedCount} tác vụ còn lại.`,
      })!;
      this.emitJob(failedJob);

      this.emitNotification({
        type: 'warning',
        message: `Tài khoản "${session.name}" bị Google tạm giới hạn tốc độ (hoạt động bất thường). Đã tạm dừng ${pausedCount} tác vụ còn lại.`,
      });

      if (this.events.onQuotaExhausted) {
        this.events.onQuotaExhausted({
          sessionId: session.id,
          sessionName: session.name,
          pendingCount: pausedCount,
          jobName: job.name,
        });
      }
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
