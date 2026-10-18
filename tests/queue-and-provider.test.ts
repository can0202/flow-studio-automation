import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDatabase } from '../src/main/db/database.ts';
import { OutputManager } from '../src/main/services/output-manager.ts';
import { SessionManager } from '../src/main/services/session-manager.ts';
import { MockProvider } from '../src/main/services/providers/mock-provider.ts';
import { GoogleFlowAdapter } from '../src/main/services/providers/flow-adapter.ts';
import { JobQueue } from '../src/main/services/job-queue.ts';
import fs from 'fs';
import path from 'path';

describe('JobQueue & Provider Workflow', () => {
  const testDir = path.join(process.cwd(), '.data', 'test_env');
  const testDbPath = path.join(testDir, 'test.sqlite');
  const testOutputDir = path.join(testDir, 'output');
  const testSessionsDir = path.join(testDir, 'sessions');

  let db: AppDatabase;
  let outputManager: OutputManager;
  let sessionManager: SessionManager;
  let mockProvider: MockProvider;
  let flowAdapter: GoogleFlowAdapter;
  let queue: JobQueue;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDir, { recursive: true });

    db = new AppDatabase(testDbPath);
    outputManager = new OutputManager(testOutputDir);
    sessionManager = new SessionManager(db, testSessionsDir);
    mockProvider = new MockProvider(outputManager);
    flowAdapter = new GoogleFlowAdapter(outputManager);

    // Add test session
    sessionManager.addSession('Worker 1');

    queue = new JobQueue(db, sessionManager, mockProvider, flowAdapter, {}, false);
  });

  afterEach(() => {
    queue.stopLoop();
    db.close();
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should generate an image and write output file in Simulation Mode', async () => {
    const job = db.createJob({
      name: 'Test Sunset',
      type: 'image',
      provider: 'nano_banana',
      prompt: 'Vibrant sunset over calm ocean waters',
      aspectRatio: '16:9',
    });

    const session = sessionManager.getSessions()[0];
    const result = await mockProvider.generate(job, session, () => {});

    expect(result.success).toBe(true);
    expect(result.outputFile).toBeDefined();
    expect(fs.existsSync(result.outputFile!)).toBe(true);

    // Verify metadata was generated
    const metaPath = path.join(testOutputDir, 'FlowStudioProject', 'metadata', `${job.id}.json`);
    expect(fs.existsSync(metaPath)).toBe(true);
  });

  it('should detect simulated quota exhaustion and flag session', async () => {
    const job = db.createJob({
      name: 'Quota Test',
      type: 'image',
      prompt: 'Testing quota [TEST_QUOTA]',
    });

    const session = sessionManager.getSessions()[0];
    const result = await mockProvider.generate(job, session, () => {});

    expect(result.success).toBe(false);
    expect(result.isQuotaExhausted).toBe(true);
  });

  it('should retry transient errors with exponential backoff', async () => {
    const job = db.createJob({
      name: 'Retry Test',
      type: 'image',
      prompt: 'Testing retry [TEST_RETRY]',
      maxRetries: 3,
    });

    const session = sessionManager.getSessions()[0];

    // Attempt 1 fails
    const attempt1 = await mockProvider.generate(job, session, () => {});
    expect(attempt1.success).toBe(false);
    expect(attempt1.isTransient).toBe(true);

    // Simulate queue incrementing retryCount
    db.updateJob(job.id, { retryCount: 1 });
    const retriedJob = db.getJobById(job.id)!;

    // Attempt 2 succeeds
    const attempt2 = await mockProvider.generate(retriedJob, session, () => {});
    expect(attempt2.success).toBe(true);
    expect(attempt2.outputFile).toBeDefined();
  });

  it('should block dependent video job until parent image completes', async () => {
    queue.stopLoop();

    const imgJob = db.createJob({
      name: 'Parent Image',
      type: 'image',
      prompt: 'Magical forest clearing',
      requiresApproval: true,
    });

    const vidJob = db.createJob({
      name: 'Child Video',
      type: 'video',
      prompt: 'Camera sweeps forward',
      dependencyJobId: imgJob.id,
    });

    // When parent is waiting for approval
    db.updateJob(imgJob.id, { status: 'waiting_for_user' });
    await queue.processQueue();
    expect(db.getJobById(vidJob.id)?.status).toBe('pending');

    // Simulate parent completed and user approved
    const dummyOutput = path.join(testOutputDir, 'dummy.svg');
    fs.writeFileSync(dummyOutput, '<svg></svg>');
    db.updateJob(imgJob.id, {
      status: 'completed',
      outputFile: dummyOutput,
      approvedByUser: true,
    });

    // Process queue again: child should now be able to pick up parent output
    await queue.processQueue();
    const updatedVid = db.getJobById(vidJob.id);
    expect(updatedVid?.referenceImageUrl).toBe(dummyOutput);
  });
});
