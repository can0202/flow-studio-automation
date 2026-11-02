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
  Wand2,
  Mic,
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
    { id: 'tts', label: 'Giọng đọc (TTS)', icon: Mic },
    { id: 'prompt-gen', label: 'Tạo Prompt SRT', icon: Wand2 },
    { id: 'image', label: 'Tạo ảnh', icon: ImageIcon },
    { id: 'video', label: 'Tạo video', icon: VideoIcon },
    { id: 'image-to-video', label: 'Ảnh → Video', icon: Film, badge: reviewNeededCount, badgeColor: 'bg-amber-400 text-white' },
    { id: 'queue', label: 'Hàng đợi', icon: ListOrdered, badge: pendingOrRunningCount, badgeColor: 'bg-white/20 text-white' },
    { id: 'sessions', label: 'Phiên làm việc', icon: Globe, badge: sessionAttentionCount, badgeColor: 'bg-rose-500 text-white' },
    { id: 'outputs', label: 'File đầu ra', icon: FolderDown },
    { id: 'settings', label: 'Cài đặt', icon: Sliders },
  ];

  return (
    <aside className="w-64 bg-[#1E0F3E] flex flex-col justify-between select-none">
      <div>
        {/* App Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5F2CFF] to-[#9B7AFF] flex items-center justify-center shadow-lg shadow-[#5F2CFF]/40">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Flow Studio
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-white/10 text-white/70 border border-white/15">
                v3.0
              </span>
            </h1>
            <p className="text-[11px] text-white/45 font-medium">Nano Banana & Veo 3</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${isActive
                  ? 'bg-[#5F2CFF] text-white shadow-lg shadow-[#5F2CFF]/30'
                  : 'text-white/55 hover:text-white hover:bg-white/8'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-white/50'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-white/20 text-white'
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
      <div className="p-3 space-y-2 border-t border-white/8">
        {/* Simulation mode indicator */}
        <div className="p-2.5 rounded-lg bg-white/6 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${settings?.simulationMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                  }`}
              />
              <span className="text-xs font-semibold text-white/75">
                {settings?.simulationMode ? 'Chế độ Giả lập' : 'Chế độ Thực'}
              </span>
            </div>
            <button
              onClick={() => updateSettings({ simulationMode: !settings?.simulationMode })}
              className="text-[11px] px-2 py-0.5 rounded font-semibold bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            >
              Đổi
            </button>
          </div>
          {settings?.simulationMode && (
            <p className="text-[10px] text-amber-700/70 mt-1 leading-tight">
              Kiểm thử cục bộ, không gửi yêu cầu đến Google Flow.
            </p>
          )}
        </div>

        {/* Queue Start/Pause button */}
        <button
          onClick={toggleQueue}
          className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${isQueueRunning
            ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
            : 'bg-[#5F2CFF]/20 text-white/80 border border-[#5F2CFF]/30 hover:bg-[#5F2CFF]/35 hover:text-white'
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
