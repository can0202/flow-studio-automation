import { contextBridge, ipcRenderer } from 'electron';
import type { IElectronAPI, Settings, CreateJobInput, SessionStatus, QueueStats, Job, Session } from '../shared/types.ts';

const api: IElectronAPI = {
  // App & settings
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  updateSettings: (settings: Partial<Settings>) => ipcRenderer.invoke('app:updateSettings', settings),
  getStats: () => ipcRenderer.invoke('app:getStats'),
  selectFolder: () => ipcRenderer.invoke('app:selectFolder'),

  // Sessions
  getSessions: () => ipcRenderer.invoke('sessions:list'),
  addSession: (name: string) => ipcRenderer.invoke('sessions:add', name),
  openSessionBrowser: (sessionId: string) => ipcRenderer.invoke('sessions:openBrowser', sessionId),
  testSessionConnection: (sessionId: string) => ipcRenderer.invoke('sessions:testConnection', sessionId),
  updateSessionStatus: (sessionId: string, status: SessionStatus) => ipcRenderer.invoke('sessions:updateStatus', sessionId, status),
  removeSession: (sessionId: string) => ipcRenderer.invoke('sessions:remove', sessionId),
  getSessionQuota: (sessionId: string) => ipcRenderer.invoke('sessions:getQuota', sessionId),

  // Jobs
  getJobs: () => ipcRenderer.invoke('jobs:list'),
  createJob: (input: CreateJobInput) => ipcRenderer.invoke('jobs:create', input),
  createBatchJobs: (inputs: CreateJobInput[]) => ipcRenderer.invoke('jobs:createBatch', inputs),
  retryJob: (jobId: string) => ipcRenderer.invoke('jobs:retry', jobId),
  cancelJob: (jobId: string) => ipcRenderer.invoke('jobs:cancel', jobId),
  approveJob: (jobId: string) => ipcRenderer.invoke('jobs:approve', jobId),
  deleteJob: (jobId: string) => ipcRenderer.invoke('jobs:delete', jobId),
  clearCompletedJobs: () => ipcRenderer.invoke('jobs:clearCompleted'),
  clearAllJobs: () => ipcRenderer.invoke('jobs:clearAll'),
  retryFailedJobs: () => ipcRenderer.invoke('jobs:retryFailed'),

  // Queue
  startQueue: () => ipcRenderer.invoke('queue:start'),
  pauseQueue: () => ipcRenderer.invoke('queue:pause'),
  resumeQueue: () => ipcRenderer.invoke('queue:resume'),
  isQueueRunning: () => ipcRenderer.invoke('queue:isRunning'),

  // Outputs
  getOutputs: (projectName?: string) => ipcRenderer.invoke('outputs:list', projectName),
  openFile: (filePath: string) => ipcRenderer.invoke('outputs:openFile', filePath),
  revealInExplorer: (filePath: string) => ipcRenderer.invoke('outputs:revealInExplorer', filePath),
  readAsDataUrl: (filePath: string) => ipcRenderer.invoke('outputs:readAsDataUrl', filePath),
  batchRenameOutputs: (options: any) => ipcRenderer.invoke('outputs:batchRename', options),
  deleteOutput: (filePath: string) => ipcRenderer.invoke('outputs:delete', filePath),
  deleteOutputs: (filePaths: string[]) => ipcRenderer.invoke('outputs:deleteBatch', filePaths),

  // Media Sync
  startMediaSync: (options: any) => ipcRenderer.invoke('sync:start', options),
  cancelMediaSync: () => ipcRenderer.invoke('sync:cancel'),
  scanProjects: (sessionId?: string) => ipcRenderer.invoke('sync:scanProjects', sessionId ?? ''),

  // Event Listeners
  onQueueStatsUpdated: (callback: (stats: QueueStats) => void) => {
    const handler = (_event: any, stats: QueueStats) => callback(stats);
    ipcRenderer.on('queue:statsUpdated', handler);
    return () => ipcRenderer.removeListener('queue:statsUpdated', handler);
  },
  onJobUpdated: (callback: (job: Job) => void) => {
    const handler = (_event: any, job: Job) => callback(job);
    ipcRenderer.on('jobs:jobUpdated', handler);
    return () => ipcRenderer.removeListener('jobs:jobUpdated', handler);
  },
  onSessionUpdated: (callback: (session: Session) => void) => {
    const handler = (_event: any, session: Session) => callback(session);
    ipcRenderer.on('sessions:sessionUpdated', handler);
    return () => ipcRenderer.removeListener('sessions:sessionUpdated', handler);
  },
  onNotification: (callback: (notification: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void) => {
    const handler = (_event: any, notification: any) => callback(notification);
    ipcRenderer.on('app:notification', handler);
    return () => ipcRenderer.removeListener('app:notification', handler);
  },
  onSyncProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('sync:progress', handler);
    return () => ipcRenderer.removeListener('sync:progress', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
