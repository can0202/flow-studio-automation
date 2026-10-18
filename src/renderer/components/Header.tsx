import React from 'react';
import { useAppStore, type TabType } from '../store/app-store.ts';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Zap } from 'lucide-react';

const VIEW_TITLES: Record<TabType, { title: string; desc: string }> = {
  dashboard: { title: 'Bảng điều khiển', desc: 'Tổng quan hệ thống, số liệu tạo nội dung và trạng thái các phiên đang hoạt động' },
  image: { title: 'Tạo ảnh (Nano Banana)', desc: 'Tạo hình ảnh chất lượng cao với Imagen / Nano Banana' },
  video: { title: 'Tạo video (Veo 3)', desc: 'Tạo video điện ảnh sử dụng engine Google Veo 3' },
  'image-to-video': { title: 'Ảnh → Video', desc: 'Chuyển đổi ảnh thành video Veo 3 với tùy chọn duyệt trước' },
  queue: { title: 'Hàng đợi & Lịch trình', desc: 'Quản lý job đang chờ, nhập hàng loạt, thử lại và đồng thời' },
  sessions: { title: 'Quản lý phiên', desc: 'Phiên trình duyệt Google Flow cô lập với bảo vệ đăng nhập & quota' },
  outputs: { title: 'File đầu ra', desc: 'Duyệt và xem các ảnh, video đã tải về và siêu dữ liệu JSON' },
  settings: { title: 'Cài đặt', desc: 'Cấu hình đồng thời, thư mục đầu ra và tùy chọn tự động hóa' },
};

export const Header: React.FC = () => {
  const { activeTab, settings, stats, notifications, removeNotification, updateSettings } = useAppStore();
  const currentView = VIEW_TITLES[activeTab] || { title: 'Flow Studio', desc: '' };

  return (
    <header className="h-16 px-8 border-b border-slate-800/80 bg-[#0b101c]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
      <div>
        <h2 className="text-base font-bold text-white tracking-tight">{currentView.title}</h2>
        <p className="text-xs text-slate-400">{currentView.desc}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Simulation Mode warning badge */}
        {settings?.simulationMode && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse" />
            <span>Chế độ Giả lập Đang bật</span>
          </div>
        )}

        {/* Quick KPI badge */}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-slate-400">Đang chạy:</span>
            <span className="font-bold text-indigo-400">{stats?.running || 0}</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Hoàn thành:</span>
            <span className="font-bold text-emerald-400">{stats?.completed || 0}</span>
          </div>
          {stats?.attentionSessions ? (
            <>
              <div className="h-3 w-[1px] bg-slate-800" />
              <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{stats.attentionSessions} Cần xác thực</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Floating Notifications (Toasts) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {notifications.map((notif) => {
          const icons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
            error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
            info: <Info className="w-4 h-4 text-indigo-400 shrink-0" />,
          };
          const borders = {
            success: 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
            warning: 'border-amber-500/30 bg-amber-950/90 text-amber-100',
            error: 'border-rose-500/30 bg-rose-950/90 text-rose-100',
            info: 'border-indigo-500/30 bg-slate-900/90 text-slate-100',
          };

          return (
            <div
              key={notif.id}
              className={`pointer-events-auto p-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
                borders[notif.type]
              }`}
            >
              {icons[notif.type]}
              <div className="flex-1 font-medium leading-relaxed">{notif.message}</div>
              <button
                onClick={() => removeNotification(notif.id)}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </header>
  );
};
