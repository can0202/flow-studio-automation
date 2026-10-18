import { create } from 'zustand';
import type { Settings, QueueStats } from '../../shared/types.ts';

export type TabType =
  | 'dashboard'
  | 'image'
  | 'video'
  | 'image-to-video'
  | 'queue'
  | 'sessions'
  | 'outputs'
  | 'settings';

export interface ToastNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

interface AppState {
  activeTab: TabType;
  settings: Settings | null;
  stats: QueueStats | null;
  isQueueRunning: boolean;
  notifications: ToastNotification[];

  setActiveTab: (tab: TabType) => void;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  loadStats: () => Promise<void>;
  setQueueRunning: (running: boolean) => void;
  toggleQueue: () => Promise<void>;
  addNotification: (notif: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => void;
  removeNotification: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'dashboard',
  settings: null,
  stats: null,
  isQueueRunning: true,
  notifications: [],

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadSettings: async () => {
    try {
      const s = await window.api.getSettings();
      set({ settings: s });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  updateSettings: async (partial) => {
    try {
      const s = await window.api.updateSettings(partial);
      set({ settings: s });
      get().addNotification({ type: 'success', message: 'Đã lưu cài đặt thành công.' });
    } catch (err) {
      console.error('Failed to update settings:', err);
      get().addNotification({ type: 'error', message: 'Lưu cài đặt thất bại.' });
    }
  },

  loadStats: async () => {
    try {
      const stats = await window.api.getStats();
      set({ stats });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  },

  setQueueRunning: (running) => set({ isQueueRunning: running }),

  toggleQueue: async () => {
    const current = get().isQueueRunning;
    if (current) {
      await window.api.pauseQueue();
      set({ isQueueRunning: false });
      get().addNotification({ type: 'info', message: 'Đã tạm dừng thực thi queue.' });
    } else {
      await window.api.resumeQueue();
      set({ isQueueRunning: true });
      get().addNotification({ type: 'success', message: 'Đã bắt đầu/tiếp tục thực thi queue.' });
    }
  },

  addNotification: (notif) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const item: ToastNotification = { ...notif, id, timestamp: Date.now() };
    set((state) => ({ notifications: [item, ...state.notifications].slice(0, 5) }));

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      get().removeNotification(id);
    }, 5000);
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
