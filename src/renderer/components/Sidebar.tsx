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
    { id: 'image-to-video', label: 'Ảnh → Video', icon: Film, badge: reviewNeededCount, badgeColor: 'bg-amber-500' },
    { id: 'queue', label: 'Hàng đợi', icon: ListOrdered, badge: pendingOrRunningCount, badgeColor: 'bg-[#CFFF74] text-[#111A09]' },
    { id: 'sessions', label: 'Phiên làm việc', icon: Globe, badge: sessionAttentionCount, badgeColor: 'bg-rose-500' },
    { id: 'outputs', label: 'File đầu ra', icon: FolderDown },
    { id: 'settings', label: 'Cài đặt', icon: Sliders },
  ];

  return (
    <aside className="w-64 bg-[#111A09] border-r border-[#3A4F22] flex flex-col justify-between select-none">
      <div>
        {/* App Brand Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[#3A4F22]/80">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#CFFF74] to-[#A8D95A] flex items-center justify-center shadow-lg shadow-[#CFFF74]/20">
            <Zap className="w-5 h-5 text-[#111A09] fill-[#111A09]" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#CFFF74] flex items-center gap-1.5">
              Flow Studio
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-[#CFFF74]/10 text-[#CFFF74] border border-[#CFFF74]/20">
                MVP
              </span>
            </h1>
            <p className="text-[11px] text-[#9DB87A] font-medium">Nano Banana &amp; Veo 3</p>
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                  ? 'bg-[#CFFF74] text-[#111A09] shadow-md shadow-[#CFFF74]/20'
                  : 'text-[#9DB87A] hover:text-[#CFFF74] hover:bg-[#2F3A1D]'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#111A09]' : 'text-[#9DB87A]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${item.badgeColor || 'bg-[#CFFF74] text-[#111A09]'
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
      <div className="p-3 space-y-2.5 border-t border-[#3A4F22]/80">
        {/* Simulation mode indicator / toggle */}
        <div className="p-2.5 rounded-lg bg-[#1A2410] border border-[#3A4F22]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${settings?.simulationMode ? 'bg-amber-400 animate-pulse' : 'bg-[#CFFF74]'
                  }`}
              />
              <span className="text-xs font-semibold text-[#E8F5D0]">
                {settings?.simulationMode ? 'Chế độ Giả lập' : 'Chế độ Thực'}
              </span>
            </div>
            <button
              onClick={() => updateSettings({ simulationMode: !settings?.simulationMode })}
              className="text-[11px] px-2 py-0.5 rounded font-medium bg-[#2F3A1D] hover:bg-[#3A4F22] text-[#9DB87A] transition-colors"
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
          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${isQueueRunning
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
            : 'bg-[#CFFF74]/10 text-[#CFFF74] border border-[#CFFF74]/20 hover:bg-[#CFFF74]/20'
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
