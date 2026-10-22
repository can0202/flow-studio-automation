import { create } from 'zustand';
import type { OutputFileItem } from '../../shared/types.ts';

interface OutputState {
  outputs: OutputFileItem[];
  selectedOutput: OutputFileItem | null;
  filterType: 'all' | 'image' | 'video';
  filterProject: string;
  searchQuery: string;
  isLoading: boolean;

  loadOutputs: (projectName?: string) => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  revealInExplorer: (filePath: string) => Promise<void>;
  deleteOutput: (filePath: string) => Promise<boolean>;
  deleteOutputs: (filePaths: string[]) => Promise<{ success: boolean; deletedCount: number }>;
  setSelectedOutput: (item: OutputFileItem | null) => void;
  setFilterType: (filterType: 'all' | 'image' | 'video') => void;
  setFilterProject: (filterProject: string) => void;
  setSearchQuery: (query: string) => void;
}

export const useOutputStore = create<OutputState>((set, get) => ({
  outputs: [],
  selectedOutput: null,
  filterType: 'all',
  filterProject: 'all',
  searchQuery: '',
  isLoading: false,

  loadOutputs: async (projectName) => {
    set({ isLoading: true });
    try {
      const outputs = await window.api.getOutputs(projectName === 'all' ? undefined : projectName);
      set({ outputs, isLoading: false });
    } catch (err) {
      console.error('Failed to load outputs:', err);
      set({ isLoading: false });
    }
  },

  openFile: async (filePath) => {
    try {
      await window.api.openFile(filePath);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  },

  revealInExplorer: async (filePath) => {
    try {
      await window.api.revealInExplorer(filePath);
    } catch (err) {
      console.error('Failed to reveal file:', err);
    }
  },

  deleteOutput: async (filePath: string) => {
    try {
      const res = await window.api.deleteOutput(filePath);
      if (res) {
        set((state) => ({
          outputs: state.outputs.filter((o) => o.path !== filePath),
          selectedOutput: state.selectedOutput?.path === filePath ? null : state.selectedOutput,
        }));
      }
      return res;
    } catch (err) {
      console.error('Failed to delete output:', err);
      return false;
    }
  },

  deleteOutputs: async (filePaths: string[]) => {
    try {
      const res = await window.api.deleteOutputs(filePaths);
      if (res.success) {
        const pathSet = new Set(filePaths);
        set((state) => ({
          outputs: state.outputs.filter((o) => !pathSet.has(o.path)),
          selectedOutput: state.selectedOutput && pathSet.has(state.selectedOutput.path) ? null : state.selectedOutput,
        }));
      }
      return res;
    } catch (err) {
      console.error('Failed to delete outputs batch:', err);
      return { success: false, deletedCount: 0 };
    }
  },

  setSelectedOutput: (selectedOutput) => set({ selectedOutput }),
  setFilterType: (filterType) => set({ filterType }),
  setFilterProject: (filterProject) => set({ filterProject }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
