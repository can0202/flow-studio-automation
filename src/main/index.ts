import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { AppDatabase } from './db/database.ts';
import { OutputManager } from './services/output-manager.ts';
import { SessionManager } from './services/session-manager.ts';
import { MockProvider } from './services/providers/mock-provider.ts';
import { GoogleFlowAdapter } from './services/providers/flow-adapter.ts';
import { JobQueue } from './services/job-queue.ts';
import { MediaSyncService } from './services/media-sync.ts';
import { BatchNamer } from './services/batch-namer.ts';
import type { CreateJobInput, SessionStatus, Settings, SyncMediaOptions, BatchRenameOptions } from '../shared/types.ts';

// Register standard custom protocol for safe streaming/loading of local media (images & videos)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let db: AppDatabase;
let outputManager: OutputManager;
let sessionManager: SessionManager;
let mockProvider: MockProvider;
let flowAdapter: GoogleFlowAdapter;
let jobQueue: JobQueue;
let mediaSyncService: MediaSyncService;

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#090d16',
    title: 'Flow Studio Automation',
    titleBarStyle: 'default',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initApp() {
  db = new AppDatabase();
  outputManager = new OutputManager(db.getSettings().outputDir);
  sessionManager = new SessionManager(db);
  mockProvider = new MockProvider(outputManager);
  flowAdapter = new GoogleFlowAdapter(outputManager, db.getSettings().flowUrl);
  mediaSyncService = new MediaSyncService(outputManager, sessionManager);

  // Initialize at least 1 default session if none exist
  const existingSessions = sessionManager.getSessions();
  if (existingSessions.length === 0) {
    sessionManager.addSession('Phiên làm việc Studio chính');
  }

  jobQueue = new JobQueue(db, sessionManager, mockProvider, flowAdapter, {
    onJobUpdated: (job) => {
      mainWindow?.webContents.send('jobs:jobUpdated', job);
    },
    onSessionUpdated: (session) => {
      mainWindow?.webContents.send('sessions:sessionUpdated', session);
    },
    onStatsUpdated: (stats) => {
      mainWindow?.webContents.send('queue:statsUpdated', stats);
    },
    onNotification: (notif) => {
      mainWindow?.webContents.send('app:notification', notif);
    },
  });

  registerIpcHandlers();
}

function registerIpcHandlers() {
  // App & settings
  ipcMain.handle('app:getSettings', async () => {
    return db.getSettings();
  });

  ipcMain.handle('app:updateSettings', async (_e, partial: Partial<Settings>) => {
    const updated = db.updateSettings(partial);
    if (partial.outputDir) {
      outputManager.setBaseDir(partial.outputDir);
    }
    if (partial.flowUrl) {
      flowAdapter.setFlowUrl(partial.flowUrl);
    }
    if (partial.concurrencyLimit) {
      jobQueue.processQueue();
    }
    return updated;
  });

  ipcMain.handle('app:getStats', async () => {
    return db.getStats();
  });

  ipcMain.handle('app:selectFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Sessions
  ipcMain.handle('sessions:list', async () => {
    return sessionManager.getSessions();
  });

  ipcMain.handle('sessions:add', async (_e, name: string) => {
    const s = sessionManager.addSession(name);
    return s;
  });

  ipcMain.handle('sessions:openBrowser', async (_e, sessionId: string) => {
    return sessionManager.openBrowser(sessionId);
  });

  ipcMain.handle('sessions:testConnection', async (_e, sessionId: string) => {
    return sessionManager.testConnection(sessionId);
  });

  ipcMain.handle('sessions:updateStatus', async (_e, sessionId: string, status: SessionStatus) => {
    sessionManager.updateStatus(sessionId, status);
  });

  ipcMain.handle('sessions:remove', async (_e, sessionId: string) => {
    return sessionManager.removeSession(sessionId);
  });

  // Jobs
  ipcMain.handle('jobs:list', async () => {
    return db.getJobs();
  });

  ipcMain.handle('jobs:create', async (_e, input: CreateJobInput) => {
    const job = db.createJob(input);
    jobQueue.processQueue();
    return job;
  });

  ipcMain.handle('jobs:createBatch', async (_e, inputs: CreateJobInput[]) => {
    const jobs = inputs.map((input) => db.createJob(input));
    jobQueue.processQueue();
    return jobs;
  });

  ipcMain.handle('jobs:retry', async (_e, jobId: string) => {
    jobQueue.retryJob(jobId);
  });

  ipcMain.handle('jobs:cancel', async (_e, jobId: string) => {
    jobQueue.cancelJob(jobId);
  });

  ipcMain.handle('jobs:approve', async (_e, jobId: string) => {
    jobQueue.approveJob(jobId);
  });

  ipcMain.handle('jobs:delete', async (_e, jobId: string) => {
    db.deleteJob(jobId);
  });

  ipcMain.handle('jobs:clearCompleted', async () => {
    db.clearCompletedJobs();
  });

  ipcMain.handle('jobs:clearAll', async () => {
    jobQueue.clearAllJobs();
  });

  ipcMain.handle('jobs:retryFailed', async () => {
    db.retryFailedJobs();
    jobQueue.processQueue();
  });

  // Queue
  ipcMain.handle('queue:start', async () => {
    jobQueue.startQueue();
  });

  ipcMain.handle('queue:pause', async () => {
    jobQueue.pauseQueue();
  });

  ipcMain.handle('queue:resume', async () => {
    jobQueue.resumeQueue();
  });

  ipcMain.handle('queue:isRunning', async () => {
    return jobQueue.isQueueRunning();
  });

  // Outputs
  ipcMain.handle('outputs:list', async (_e, projectName?: string) => {
    return outputManager.listOutputs(projectName);
  });

  ipcMain.handle('outputs:openFile', async (_e, filePath: string) => {
    outputManager.openFile(filePath);
  });

  ipcMain.handle('outputs:revealInExplorer', async (_e, filePath: string) => {
    outputManager.revealInExplorer(filePath);
  });

  ipcMain.handle('outputs:readAsDataUrl', async (_e, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      const data = await fs.promises.readFile(filePath);
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('outputs:batchRename', async (_e, options: BatchRenameOptions) => {
    return BatchNamer.renameOutputs(outputManager, options);
  });

  ipcMain.handle('outputs:delete', async (_e, filePath: string) => {
    return outputManager.deleteOutput(filePath);
  });

  ipcMain.handle('outputs:deleteBatch', async (_e, filePaths: string[]) => {
    return outputManager.deleteOutputs(filePaths);
  });

  // Media Sync
  ipcMain.handle('sync:start', async (_e, options: SyncMediaOptions) => {
    return mediaSyncService.sync(options, (progress) => {
      mainWindow?.webContents.send('sync:progress', progress);
    });
  });

  ipcMain.handle('sync:cancel', async () => {
    mediaSyncService.cancel();
  });

  ipcMain.handle('sync:scanProjects', async (_e, sessionId?: string | null) => {
    console.log(`[IPC] sync:scanProjects received sessionId="${sessionId}"`);
    return mediaSyncService.scanProjects(sessionId);
  });
}

function registerProtocolHandlers() {
  protocol.handle('app-media', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        filePath = decodeURIComponent(parsedUrl.pathname);
        if (process.platform === 'win32' && filePath.startsWith('/')) {
          filePath = filePath.slice(1);
        }
      } else {
        filePath = decodeURIComponent(filePath);
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('File not found: ' + filePath, { status: 404 });
      }

      // Read file into memory immediately so the file handle is released
      // (avoids Windows file-lock issues that block deletion while image is displayed)
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mimeType },
      });
    } catch (err: any) {
      console.error('[Protocol app-media] Error serving file:', err);
      return new Response('Protocol error: ' + (err.message || String(err)), { status: 500 });
    }
  });
}

app.whenReady().then(() => {
  registerProtocolHandlers();
  initApp();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (jobQueue) jobQueue.stopLoop();
  if (db) db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
