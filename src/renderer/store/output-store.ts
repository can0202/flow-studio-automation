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

  setSelectedOutput: (selectedOutput) => set({ selectedOutput }),
  setFilterType: (filterType) => set({ filterType }),
  setFilterProject: (filterProject) => set({ filterProject }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
