import React from 'react';
import {
  LayoutDashboard,
  Image as ImageIcon,
  Video as VideoIcon,
  Film,
  ListOrdered,
  Globe,
  FolderDown,
  Sliders,
  Play,
  Pause,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore, type TabType } from '../store/app-store.ts';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, settings, updateSettings, isQueueRunning, toggleQueue } = useAppStore();
  const { jobs } = useQueueStore();
  const { sessions } = useSessionStore();

  const pendingOrRunningCount = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;
  const reviewNeededCount = jobs.filter((j) => j.status === 'waiting_for_user').length;
  const sessionAttentionCount = sessions.filter(
    (s) => s.status === 'auth_required' || s.status === 'quota_exhausted'
  ).length;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard },
    { id: 'image', label: 'Tạo ảnh', icon: ImageIcon },
    { id: 'video', label: 'Tạo video', icon: VideoIcon },
    { id: 'image-to-video', label: 'Ảnh → Video', icon: Film, badge: reviewNeededCount, badgeColor: 'bg-amber-500' },
    { id: 'queue', label: 'Hàng đợi', icon: ListOrdered, badge: pendingOrRunningCount, badgeColor: 'bg-indigo-500' },
    { id: 'sessions', label: 'Phiên làm việc', icon: Globe, badge: sessionAttentionCount, badgeColor: 'bg-rose-500' },
    { id: 'outputs', label: 'File đầu ra', icon: FolderDown },
    { id: 'settings', label: 'Cài đặt', icon: Sliders },
  ];

  return (
    <aside className="w-64 bg-[#0d1322] border-r border-slate-800 flex flex-col justify-between select-none">
      <div>
        {/* App Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Flow Studio
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                MVP
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Nano Banana & Veo 3</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                      item.badgeColor || 'bg-indigo-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls */}
      <div className="p-3 space-y-2.5 border-t border-slate-800/80">
        {/* Simulation mode indicator / toggle */}
        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  settings?.simulationMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <span className="text-xs font-semibold text-slate-300">
                {settings?.simulationMode ? 'Chế độ Giả lập' : 'Chế độ Thực'}
              </span>
            </div>
            <button
              onClick={() => updateSettings({ simulationMode: !settings?.simulationMode })}
              className="text-[11px] px-2 py-0.5 rounded font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Chuyển đổi
            </button>
          </div>
          {settings?.simulationMode && (
            <p className="text-[10px] text-amber-400/80 mt-1 leading-tight">
              Kiểm thử cục bộ, không gửi yêu cầu đến Google Flow.
            </p>
          )}
        </div>

        {/* Queue Start/Pause button */}
        <button
          onClick={toggleQueue}
          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            isQueueRunning
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
          }`}
        >
          {isQueueRunning ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Tạm dừng hàng đợi</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Bắt đầu hàng đợi</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
