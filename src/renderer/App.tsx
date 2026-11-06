import React, { useEffect, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { useAppStore } from './store/app-store.ts';
import { useQueueStore } from './store/queue-store.ts';
import { useSessionStore } from './store/session-store.ts';
import { DashboardView } from './views/DashboardView.tsx';
import { CapCutExportModal } from './components/CapCutExportModal.tsx';

// Code-split heavy views with React.lazy to make initial app launch instantaneous
const ImageGenView = lazy(() => import('./views/ImageGenView.tsx').then((m) => ({ default: m.ImageGenView })));
const VideoGenView = lazy(() => import('./views/VideoGenView.tsx').then((m) => ({ default: m.VideoGenView })));
const ImageToVideoView = lazy(() => import('./views/ImageToVideoView.tsx').then((m) => ({ default: m.ImageToVideoView })));
const QueueView = lazy(() => import('./views/QueueView.tsx').then((m) => ({ default: m.QueueView })));
const SessionsView = lazy(() => import('./views/SessionsView.tsx').then((m) => ({ default: m.SessionsView })));
const OutputsView = lazy(() => import('./views/OutputsView.tsx').then((m) => ({ default: m.OutputsView })));
const SettingsView = lazy(() => import('./views/SettingsView.tsx').then((m) => ({ default: m.SettingsView })));
const PromptGenView = lazy(() => import('./views/PromptGenView.tsx').then((m) => ({ default: m.PromptGenView })));
const TTSGenView = lazy(() => import('./views/TTSGenView.tsx').then((m) => ({ default: m.TTSGenView })));

export const App: React.FC = () => {
  const { activeTab, loadSettings, loadStats, addNotification, capcutModal, closeCapCutModal } = useAppStore();
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
      });

      const unsubSession = window.api.onSessionUpdated((session) => {
        handleSessionUpdate(session);
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
      case 'prompt-gen':
        return <PromptGenView />;
      case 'tts':
        return <TTSGenView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F4F6FF] text-[#1A0A4A]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden relative">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-[#8B85B8] text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#5F2CFF] border-t-transparent rounded-full animate-spin" />
                <span>Đang tải giao diện...</span>
              </div>
            </div>
          }>
            {renderActiveView()}
          </Suspense>
        </main>
      </div>

      <CapCutExportModal
        isOpen={capcutModal.isOpen}
        onClose={closeCapCutModal}
        initialDraftName={capcutModal.initialDraftName}
        initialSrtText={capcutModal.initialSrtText}
        initialSrtPath={capcutModal.initialSrtPath}
        initialAudioPath={capcutModal.initialAudioPath}
        initialMediaPaths={capcutModal.initialMediaPaths}
        initialMediaFolder={capcutModal.initialMediaFolder}
      />
    </div>
  );
};
