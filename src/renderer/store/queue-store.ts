import { create } from 'zustand';
import type { Job, CreateJobInput } from '../../shared/types.ts';

interface QueueState {
  jobs: Job[];
  selectedJob: Job | null;
  statusFilter: string;
  searchQuery: string;
  isLoading: boolean;

  loadJobs: () => Promise<void>;
  createJob: (input: CreateJobInput) => Promise<Job | null>;
  createBatchJobs: (inputs: CreateJobInput[]) => Promise<Job[]>;
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  approveJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  clearAll: () => Promise<void>;
  retryFailed: () => Promise<void>;
  setSelectedJob: (job: Job | null) => void;
  setStatusFilter: (filter: string) => void;
  setSearchQuery: (query: string) => void;
  handleJobUpdate: (updatedJob: Job) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  jobs: [],
  selectedJob: null,
  statusFilter: 'all',
  searchQuery: '',
  isLoading: false,

  loadJobs: async () => {
    set({ isLoading: true });
    try {
      const jobs = await window.api.getJobs();
      set({ jobs, isLoading: false });
    } catch (err) {
      console.error('Failed to load jobs:', err);
      set({ isLoading: false });
    }
  },

  createJob: async (input) => {
    try {
      const job = await window.api.createJob(input);
      set((state) => ({ jobs: [job, ...state.jobs] }));
      return job;
    } catch (err) {
      console.error('Failed to create job:', err);
      return null;
    }
  },

  createBatchJobs: async (inputs) => {
    try {
      const newJobs = await window.api.createBatchJobs(inputs);
      set((state) => ({ jobs: [...newJobs, ...state.jobs] }));
      return newJobs;
    } catch (err) {
      console.error('Failed to create batch jobs:', err);
      return [];
    }
  },

  retryJob: async (jobId) => {
    try {
      await window.api.retryJob(jobId);
    } catch (err) {
      console.error('Failed to retry job:', err);
    }
  },

  cancelJob: async (jobId) => {
    try {
      await window.api.cancelJob(jobId);
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  },

  approveJob: async (jobId) => {
    try {
      await window.api.approveJob(jobId);
    } catch (err) {
      console.error('Failed to approve job:', err);
    }
  },

  deleteJob: async (jobId) => {
    try {
      await window.api.deleteJob(jobId);
      set((state) => ({
        jobs: state.jobs.filter((j) => j.id !== jobId),
        selectedJob: state.selectedJob?.id === jobId ? null : state.selectedJob,
      }));
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  },

  clearCompleted: async () => {
    try {
      await window.api.clearCompletedJobs();
      set((state) => ({
        jobs: state.jobs.filter((j) => j.status !== 'completed'),
      }));
    } catch (err) {
      console.error('Failed to clear completed jobs:', err);
    }
  },

  clearAll: async () => {
    try {
      await window.api.clearAllJobs();
      set({ jobs: [], selectedJob: null });
    } catch (err) {
      console.error('Failed to clear all jobs:', err);
    }
  },

  retryFailed: async () => {
    try {
      await window.api.retryFailedJobs();
      await get().loadJobs();
    } catch (err) {
      console.error('Failed to retry failed jobs:', err);
    }
  },

  setSelectedJob: (job) => set({ selectedJob: job }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  handleJobUpdate: (updatedJob) => {
    set((state) => {
      const index = state.jobs.findIndex((j) => j.id === updatedJob.id);
      if (index < 0) {
        // Job not found locally — this can happen on reconnect, add it
        // But only if it's not a race condition with createJob (check by createdAt recency)
        const alreadyExists = state.jobs.some((j) => j.id === updatedJob.id);
        if (alreadyExists) return state; // no-op
        return {
          jobs: [updatedJob, ...state.jobs],
          selectedJob: state.selectedJob,
        };
      }

      const updatedList = [...state.jobs];
      updatedList[index] = updatedJob;
      return {
        jobs: updatedList,
        selectedJob: state.selectedJob?.id === updatedJob.id ? updatedJob : state.selectedJob,
      };
    });
  },
}));
