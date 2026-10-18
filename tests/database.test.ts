import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../src/main/db/database.ts';
import fs from 'fs';
import path from 'path';

describe('AppDatabase & SQLite Persistence', () => {
  const testDbPath = path.join(process.cwd(), '.data', 'test_flow_studio.sqlite');
  let db: AppDatabase;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new AppDatabase(testDbPath);
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch {}
    }
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }
  });

  it('should initialize default settings', () => {
    const settings = db.getSettings();
    expect(settings).toBeDefined();
    expect(settings.concurrencyLimit).toBe(1);
    expect(settings.defaultMaxRetries).toBe(3);
    expect(settings.simulationMode).toBe(true);
  });

  it('should create and retrieve sessions', () => {
    const session = db.addSession('sess_1', 'Test Account', 'C:\\profiles\\sess_1');
    expect(session.id).toBe('sess_1');
    expect(session.name).toBe('Test Account');
    expect(session.status).toBe('ready');

    const retrieved = db.getSessionById('sess_1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Account');
  });

  it('should update session status and notes', () => {
    db.addSession('sess_2', 'Account 2', 'C:\\profiles\\sess_2');
    db.updateSessionStatus('sess_2', 'quota_exhausted', 'Daily limit reached');

    const updated = db.getSessionById('sess_2');
    expect(updated?.status).toBe('quota_exhausted');
    expect(updated?.notes).toBe('Daily limit reached');
  });

  it('should create, update, and recover jobs', () => {
    const job = db.createJob({
      name: 'Test Image',
      type: 'image',
      provider: 'nano_banana',
      prompt: 'A golden retriever in a field of sunflowers',
      aspectRatio: '16:9',
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');
    expect(job.progress).toBe(0);

    // Simulate job starting
    db.updateJob(job.id, { status: 'running', progress: 50 });
    const runningJob = db.getJobById(job.id);
    expect(runningJob?.status).toBe('running');
    expect(runningJob?.progress).toBe(50);

    // Crash recovery: when app restarts, running jobs should transition to interrupted
    db.runCrashRecovery();
    const recoveredJob = db.getJobById(job.id);
    expect(recoveredJob?.status).toBe('interrupted');
    expect(recoveredJob?.errorMessage).toContain('interrupted');
  });

  it('should accurately calculate queue statistics', () => {
    db.createJob({ type: 'image', prompt: 'Job 1' });
    db.createJob({ type: 'image', prompt: 'Job 2' });
    const j3 = db.createJob({ type: 'video', prompt: 'Job 3' });
    db.updateJob(j3.id, { status: 'completed' });

    const stats = db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.running).toBe(0);
  });
});
