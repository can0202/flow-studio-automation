import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import * as schema from './schema.ts';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Job, Session, Settings, QueueStats, CreateJobInput } from '../../shared/types.ts';

export class AppDatabase {
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      const dataDir = app ? path.join(app.getPath('userData'), 'database') : path.join(process.cwd(), '.data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'flow_studio.sqlite');
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.sqlite = new Database(this.dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');

    this.initTables();
    this.db = drizzle(this.sqlite, { schema });
    this.runCrashRecovery();
    this.initDefaultSettings();
  }

  private initTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        profile_dir TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        last_checked_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        aspect_ratio TEXT NOT NULL DEFAULT '1:1',
        duration INTEGER DEFAULT 5,
        reference_image_url TEXT,
        dependency_job_id TEXT,
        requires_approval INTEGER DEFAULT 0,
        approved_by_user INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        output_file TEXT,
        thumbnail_file TEXT,
        session_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public runCrashRecovery() {
    // Transition any interrupted job back to interrupted state
    const result = this.sqlite.prepare(`
      UPDATE jobs 
      SET status = 'interrupted', 
          error_message = 'Phiên làm việc bị gián đoạn (interrupted) do ứng dụng khởi động lại hoặc gặp sự cố',
          updated_at = ?
      WHERE status IN ('running', 'downloading')
    `).run(new Date().toISOString());

    if (result.changes > 0) {
      console.log(`[Database] Recovered ${result.changes} interrupted job(s) to 'interrupted' status.`);
    }

    // Reset busy sessions to ready
    this.sqlite.prepare(`
      UPDATE sessions 
      SET status = 'ready' 
      WHERE status = 'busy'
    `).run();
  }

  private initDefaultSettings() {
    const defaultSettings: Settings = {
      concurrencyLimit: 1,
      defaultMaxRetries: 3,
      outputDir: path.join(process.cwd(), 'output'),
      simulationMode: true, // Default to true as recommended for safe MVP testing
      defaultProjectName: 'FlowStudioProject',
      flowUrl: 'https://flow.google.com',
    };

    for (const [k, v] of Object.entries(defaultSettings)) {
      const exists = this.sqlite.prepare('SELECT key FROM settings WHERE key = ?').get(k);
      if (!exists) {
        this.sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));
      }
    }
  }

  public isOpen(): boolean {
    return this.sqlite?.open === true;
  }

  // Settings methods
  public getSettings(): Settings {
    if (!this.isOpen()) {
      return {
        concurrencyLimit: 1,
        defaultMaxRetries: 3,
        outputDir: path.join(process.cwd(), 'output'),
        simulationMode: true,
        defaultProjectName: 'FlowStudioProject',
        flowUrl: 'https://flow.google.com',
      };
    }
    const rows = this.sqlite.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const result: any = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result as Settings;
  }

  public updateSettings(partial: Partial<Settings>): Settings {
    const stmt = this.sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(partial)) {
      stmt.run(k, JSON.stringify(v));
    }
    return this.getSettings();
  }

  // Session methods
  public getSessions(): Session[] {
    const rows = this.sqlite.prepare('SELECT * FROM sessions ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      profileDir: r.profile_dir,
      status: r.status,
      lastCheckedAt: r.last_checked_at,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  public getSessionById(id: string): Session | undefined {
    const r = this.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      profileDir: r.profile_dir,
      status: r.status,
      lastCheckedAt: r.last_checked_at,
      notes: r.notes,
      createdAt: r.created_at,
    };
  }

  public addSession(id: string, name: string, profileDir: string, initialStatus: Session['status'] = 'ready'): Session {
    const now = new Date().toISOString();
    this.sqlite.prepare(`
      INSERT INTO sessions (id, name, profile_dir, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, profileDir, initialStatus, now);

    return {
      id,
      name,
      profileDir,
      status: initialStatus,
      createdAt: now,
    };
  }

  public updateSessionStatus(id: string, status: Session['status'], notes?: string) {
    const now = new Date().toISOString();
    if (notes !== undefined) {
      this.sqlite.prepare('UPDATE sessions SET status = ?, notes = ?, last_checked_at = ? WHERE id = ?')
        .run(status, notes, now, id);
    } else {
      this.sqlite.prepare('UPDATE sessions SET status = ?, last_checked_at = ? WHERE id = ?')
        .run(status, now, id);
    }
  }

  public removeSession(id: string) {
    this.sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  // Job methods
  public getJobs(): Job[] {
    const rows = this.sqlite.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapJobRow);
  }

  public getJobById(id: string): Job | undefined {
    const row = this.sqlite.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.mapJobRow(row);
  }

  public createJob(input: CreateJobInput): Job {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    const settings = this.getSettings();

    const name = input.name || `${input.type === 'image' ? 'Ảnh' : 'Video'}-${now.slice(11, 19)}`;
    const provider = input.provider || (input.type === 'image' ? 'nano_banana' : 'veo_3');
    const model = input.model || (input.type === 'image' ? 'imagen-3.0' : 'veo-3.0');
    const aspectRatio = input.aspectRatio || '1:1';
    const duration = input.duration || 5;
    const maxRetries = input.maxRetries ?? settings.defaultMaxRetries;
    const metadata = {
      ...(input.metadata || {}),
      ...(input.projectName ? { projectName: input.projectName } : {}),
      repeatCount: input.repeatCount ?? 1,
    };

    this.sqlite.prepare(`
      INSERT INTO jobs (
        id, name, type, provider, prompt, model, aspect_ratio, duration,
        reference_image_url, dependency_job_id, requires_approval, approved_by_user,
        status, progress, retry_count, max_retries, session_id, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      input.type,
      provider,
      input.prompt,
      model,
      aspectRatio,
      duration,
      input.referenceImageUrl || null,
      input.dependencyJobId || null,
      input.requiresApproval ? 1 : 0,
      0,
      maxRetries,
      input.sessionId || null,
      JSON.stringify(metadata),
      now,
      now
    );

    return this.getJobById(id)!;
  }

  public updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.errorMessage);
    }
    if (updates.outputFile !== undefined) {
      fields.push('output_file = ?');
      values.push(updates.outputFile);
    }
    if (updates.thumbnailFile !== undefined) {
      fields.push('thumbnail_file = ?');
      values.push(updates.thumbnailFile);
    }
    if (updates.sessionId !== undefined) {
      fields.push('session_id = ?');
      values.push(updates.sessionId);
    }
    if (updates.referenceImageUrl !== undefined) {
      fields.push('reference_image_url = ?');
      values.push(updates.referenceImageUrl);
    }
    if (updates.approvedByUser !== undefined) {
      fields.push('approved_by_user = ?');
      values.push(updates.approvedByUser ? 1 : 0);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(id);
    this.sqlite.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getJobById(id);
  }

  public deleteJob(id: string) {
    this.sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  }

  public clearCompletedJobs() {
    this.sqlite.prepare("DELETE FROM jobs WHERE status = 'completed'").run();
  }

  public clearAllJobs() {
    this.sqlite.prepare('DELETE FROM jobs').run();
  }

  public retryFailedJobs() {
    this.sqlite.prepare(`
      UPDATE jobs 
      SET status = 'pending', retry_count = 0, error_message = NULL, progress = 0, updated_at = ?
      WHERE status IN ('failed', 'interrupted')
    `).run(new Date().toISOString());
  }

  public getStats(): QueueStats {
    if (!this.isOpen()) {
      return {
        total: 0, pending: 0, running: 0, waiting_for_user: 0, completed: 0,
        failed: 0, interrupted: 0, paused: 0, activeSessions: 0, attentionSessions: 0
      };
    }
    const total = (this.sqlite.prepare('SELECT count(*) as count FROM jobs').get() as any).count;
    const pending = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'pending'").get() as any).count;
    const running = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status IN ('running', 'downloading')").get() as any).count;
    const waiting_for_user = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'waiting_for_user'").get() as any).count;
    const completed = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'completed'").get() as any).count;
    const failed = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'failed'").get() as any).count;
    const interrupted = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'interrupted'").get() as any).count;
    const paused = (this.sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'paused'").get() as any).count;

    const activeSessions = (this.sqlite.prepare("SELECT count(*) as count FROM sessions WHERE status IN ('ready', 'busy')").get() as any).count;
    const attentionSessions = (this.sqlite.prepare("SELECT count(*) as count FROM sessions WHERE status IN ('auth_required', 'quota_exhausted')").get() as any).count;

    return {
      total,
      pending,
      running,
      waiting_for_user,
      completed,
      failed,
      interrupted,
      paused,
      activeSessions,
      attentionSessions,
    };
  }

  private mapJobRow(r: any): Job {
    let meta = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {}
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      provider: r.provider,
      prompt: r.prompt,
      model: r.model,
      aspectRatio: r.aspect_ratio,
      duration: r.duration,
      referenceImageUrl: r.reference_image_url,
      dependencyJobId: r.dependency_job_id,
      requiresApproval: Boolean(r.requires_approval),
      approvedByUser: Boolean(r.approved_by_user),
      status: r.status,
      progress: r.progress,
      retryCount: r.retry_count,
      maxRetries: r.max_retries,
      errorMessage: r.error_message,
      outputFile: r.output_file,
      thumbnailFile: r.thumbnail_file,
      sessionId: r.session_id,
      metadata: meta,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at,
    };
  }

  public close() {
    this.sqlite.close();
  }
}
