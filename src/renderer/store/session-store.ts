import { create } from 'zustand';
import type { Session, SessionStatus } from '../../shared/types.ts';

interface SessionState {
  sessions: Session[];
  selectedSession: Session | null;
  isLoading: boolean;
  actionMessage: string | null;

  loadSessions: () => Promise<void>;
  addSession: (name: string) => Promise<Session | null>;
  openBrowser: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  testConnection: (sessionId: string) => Promise<{ success: boolean; status: SessionStatus; message: string; quotaInfo?: string }>;
  updateStatus: (sessionId: string, status: SessionStatus) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  getQuota: (sessionId: string) => Promise<{ success: boolean; quotaInfo: string }>;
  setSelectedSession: (session: Session | null) => void;
  handleSessionUpdate: (updatedSession: Session) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  selectedSession: null,
  isLoading: false,
  actionMessage: null,

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await window.api.getSessions();
      set({ sessions, isLoading: false });
    } catch (err) {
      console.error('Failed to load sessions:', err);
      set({ isLoading: false });
    }
  },

  addSession: async (name: string) => {
    try {
      const s = await window.api.addSession(name);
      set((state) => ({ sessions: [...state.sessions, s] }));
      return s;
    } catch (err) {
      console.error('Failed to add session:', err);
      return null;
    }
  },

  openBrowser: async (sessionId: string) => {
    try {
      const res = await window.api.openSessionBrowser(sessionId);
      return res;
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi khi mở trình duyệt' };
    }
  },

  testConnection: async (sessionId: string) => {
    try {
      const res = await window.api.testSessionConnection(sessionId);
      await get().loadSessions();
      return res;
    } catch (err: any) {
      return { success: false, status: 'paused', message: err.message || 'Lỗi khi kiểm tra kết nối' };
    }
  },

  updateStatus: async (sessionId: string, status: SessionStatus) => {
    try {
      await window.api.updateSessionStatus(sessionId, status);
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to update session status:', err);
    }
  },

  removeSession: async (sessionId: string) => {
    try {
      await window.api.removeSession(sessionId);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        selectedSession: state.selectedSession?.id === sessionId ? null : state.selectedSession,
      }));
    } catch (err) {
      console.error('Failed to remove session:', err);
    }
  },

  getQuota: async (sessionId: string) => {
    try {
      const res = await window.api.getSessionQuota(sessionId);
      await get().loadSessions(); // Refresh to get updated quotaInfo
      return res;
    } catch (err: any) {
      return { success: false, quotaInfo: err.message || 'Lỗi khi lấy quota' };
    }
  },

  setSelectedSession: (session) => set({ selectedSession: session }),

  handleSessionUpdate: (updatedSession) => {
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === updatedSession.id);
      let updated = [...state.sessions];
      if (idx >= 0) {
        updated[idx] = updatedSession;
      } else {
        updated.push(updatedSession);
      }
      return {
        sessions: updated,
        selectedSession: state.selectedSession?.id === updatedSession.id ? updatedSession : state.selectedSession,
      };
    });
  },
}));
