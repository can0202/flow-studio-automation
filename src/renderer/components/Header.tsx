import React from 'react';
import { useAppStore, type TabType } from '../store/app-store.ts';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Zap, Film } from 'lucide-react';

const VIEW_TITLES: Record<TabType, { title: string; desc: string }> = {
  dashboard: { title: 'Bảng điều khiển', desc: 'Tổng quan hệ thống, số liệu tạo nội dung và trạng thái các phiên đang hoạt động' },
  image: { title: 'Tạo ảnh (Nano Banana)', desc: 'Tạo hình ảnh chất lượng cao với Imagen / Nano Banana' },
  video: { title: 'Tạo video (Veo 3)', desc: 'Tạo video điện ảnh sử dụng engine Google Veo 3' },
  'image-to-video': { title: 'Ảnh → Video', desc: 'Chuyển đổi ảnh thành video Veo 3 với tùy chọn duyệt trước' },
  queue: { title: 'Hàng đợi & Lịch trình', desc: 'Quản lý job đang chờ, nhập hàng loạt, thử lại và đồng thời' },
  sessions: { title: 'Quản lý phiên', desc: 'Phiên trình duyệt Google Flow cô lập với bảo vệ đăng nhập & quota' },
  outputs: { title: 'File đầu ra', desc: 'Duyệt và xem các ảnh, video đã tải về và siêu dữ liệu JSON' },
  settings: { title: 'Cài đặt', desc: 'Cấu hình đồng thời, thư mục đầu ra và tùy chọn tự động hóa' },
  'prompt-gen': { title: 'Tạo Prompt từ SRT', desc: 'Dùng Gemini AI để chuyển phụ đề SRT thành image prompts theo nhân vật & style cố định' },
  tts: { title: 'Chuyển Văn Bản Thành Giọng Đọc (TTS)', desc: 'Chuyển đổi văn bản thành giọng đọc tự nhiên, chất lượng cao' },
};


export const Header: React.FC = () => {
  const { activeTab, settings, stats, notifications, removeNotification, updateSettings, openCapCutModal } = useAppStore();
  const currentView = VIEW_TITLES[activeTab] || { title: 'Flow Studio', desc: '' };

  return (
    <header className="h-16 px-8 border-b border-[#E2E6FF] bg-white shadow-sm flex items-center justify-between sticky top-0 z-30">
      <div>
        <h2 className="text-base font-bold text-[#5F2CFF] tracking-tight">{currentView.title}</h2>
        <p className="text-xs text-[#4A4070]">{currentView.desc}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Simulation Mode warning badge */}
        {settings?.simulationMode && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-700 animate-pulse" />
            <span>Chế độ Giả lập Đang bật</span>
          </div>
        )}

        {/* CapCut Quick Draft button */}
        <button
          onClick={() => openCapCutModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#5F2CFF] to-[#7B52FF] hover:from-[#7B52FF] hover:to-[#9B7AFF] text-white text-xs font-bold shadow-sm shadow-[#5F2CFF]/20 transition-all cursor-pointer"
          title="Tạo nhanh bản nháp CapCut PC (tự động khớp SRT, audio, ảnh)"
        >
          <Film className="w-3.5 h-3.5" />
          <span>CapCut Draft</span>
        </button>

        {/* Quick KPI badge */}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white border border-[#E2E6FF] shadow-sm text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#5F2CFF] animate-pulse" />
            <span className="text-[#4A4070]">Đang chạy:</span>
            <span className="font-bold text-[#5F2CFF]">{stats?.running || 0}</span>
          </div>
          <div className="h-3 w-[1px] bg-[#E2E6FF]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#4A4070]">Hoàn thành:</span>
            <span className="font-bold text-[#7B52FF]">{stats?.completed || 0}</span>
          </div>
          {stats?.attentionSessions ? (
            <>
              <div className="h-3 w-[1px] bg-[#E2E6FF]" />
              <div className="flex items-center gap-1.5 text-rose-600 font-bold">
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
            success: <CheckCircle2 className="w-4 h-4 text-[#5F2CFF] shrink-0" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />,
            error: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
            info: <Info className="w-4 h-4 text-[#0EA5E9] shrink-0" />,
          };
          const borders = {
            success: 'border-[#E2E6FF] bg-white/95 text-[#1A0A4A]',
            warning: 'border-amber-200 bg-amber-50 text-amber-800',
            error: 'border-rose-500/30 bg-rose-50 text-rose-700',
            info: 'border-[#E2E6FF] bg-white/95 text-[#1A0A4A]',
          };

          return (
            <div
              key={notif.id}
              className={`pointer-events-auto p-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${borders[notif.type]
                }`}
            >
              {icons[notif.type]}
              <div className="flex-1 font-medium leading-relaxed">{notif.message}</div>
              <button
                onClick={() => removeNotification(notif.id)}
                className="text-[#8B85B8] hover:text-[#1A0A4A] p-0.5"
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
