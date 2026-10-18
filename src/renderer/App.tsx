import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { useAppStore } from './store/app-store.ts';
import { useQueueStore } from './store/queue-store.ts';
import { useSessionStore } from './store/session-store.ts';
import { DashboardView } from './views/DashboardView.tsx';
import { ImageGenView } from './views/ImageGenView.tsx';
import { VideoGenView } from './views/VideoGenView.tsx';
import { ImageToVideoView } from './views/ImageToVideoView.tsx';
import { QueueView } from './views/QueueView.tsx';
import { SessionsView } from './views/SessionsView.tsx';
import { OutputsView } from './views/OutputsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

export const App: React.FC = () => {
  const { activeTab, loadSettings, loadStats, addNotification } = useAppStore();
  const { loadJobs, handleJobUpdate } = useQueueStore();
  const { loadSessions, handleSessionUpdate } = useSessionStore();

  useEffect(() => {
    // Initial data load
    loadSettings();
    loadStats();
    loadJobs();
    loadSessions();

    // Register IPC listeners
    if (window.api) {
      const unsubJob = window.api.onJobUpdated((job) => {
        handleJobUpdate(job);
        loadStats();
      });

      const unsubSession = window.api.onSessionUpdated((session) => {
        handleSessionUpdate(session);
        loadStats();
      });

      const unsubStats = window.api.onQueueStatsUpdated((stats) => {
        useAppStore.setState({ stats });
      });

      const unsubNotif = window.api.onNotification((notif) => {
        addNotification(notif);
      });

      return () => {
        unsubJob();
        unsubSession();
        unsubStats();
        unsubNotif();
      };
    }
  }, []);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'image':
        return <ImageGenView />;
      case 'video':
        return <VideoGenView />;
      case 'image-to-video':
        return <ImageToVideoView />;
      case 'queue':
        return <QueueView />;
      case 'sessions':
        return <SessionsView />;
      case 'outputs':
        return <OutputsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden relative">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};
