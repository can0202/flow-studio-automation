import React, { useState } from 'react';
import { useSessionStore } from '../store/session-store.ts';
import { useAppStore } from '../store/app-store.ts';
import type { Session, SessionStatus } from '../../shared/types.ts';
import {
  Globe,
  ExternalLink,
  RotateCw,
  Plus,
  Trash2,
  Pause,
  Play,
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Folder,
  X,
  Sparkles,
} from 'lucide-react';

export const SessionsView: React.FC = () => {
  const { sessions, addSession, openBrowser, testConnection, updateStatus, removeSession } = useSessionStore();
  const { addNotification, setActiveTab } = useAppStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleAddSession = async () => {
    if (!newSessionName.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập tên phiên.' });
      return;
    }

    const s = await addSession(newSessionName.trim());
    if (s) {
      addNotification({ type: 'success', message: `Đã thêm phiên "${s.name}".` });
      setIsAddModalOpen(false);
      setNewSessionName('');
    }
  };

  const handleOpenBrowser = async (session: Session) => {
    addNotification({
      type: 'info',
      message: `Đang mở trình duyệt cho "${session.name}". Sau khi đăng nhập Google Flow, hãy bấm "Kiểm tra kết nối" để hệ thống tự chuyển sang màn hình Tạo ảnh!`,
    });
    const res = await openBrowser(session.id);
    if (!res.success) {
      addNotification({ type: 'error', message: res.message });
    }
  };

  const handleTestConnection = async (session: Session) => {
    setTestingId(session.id);
    try {
      const res = await testConnection(session.id);
      if (res.success) {
        addNotification({
          type: 'success',
          message: `Phiên "${session.name}" đã sẵn sàng! Đang chuyển đến màn hình Tạo ảnh...`,
        });
        setTimeout(() => {
          setActiveTab('image');
        }, 700);
      } else {
        addNotification({ type: 'warning', message: res.message });
      }
    } finally {
      setTestingId(null);
    }
  };

  const formatNote = (note?: string) => {
    if (!note) return '';
    if (note.includes('Sign-in required') || note.includes('Authentication required') || note.includes('Yêu cầu đăng nhập')) {
      return 'Cần đăng nhập: vui lòng dùng "Mở trình duyệt" để đăng nhập Google Flow.';
    }
    if (note.includes('Quota exhausted') || note.includes('quota exceeded') || note.includes('Hết hạn ngạch')) {
      return 'Quá hạn quota: tài khoản này đã đạt giới hạn tạo nội dung hàng ngày.';
    }
    return note;
  };

  const getStatusBadge = (status: SessionStatus) => {
    const config: Record<SessionStatus, { label: string; bg: string; text: string; border: string }> = {
      ready: { label: 'Sẵn sàng', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
      busy: { label: 'Bận (Đang chạy)', bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
      auth_required: { label: 'Cần xác thực', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
      quota_exhausted: { label: 'Hết Quota', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
      paused: { label: 'Tạm dừng', bg: 'bg-slate-800', text: 'text-slate-400', border: 'border-slate-700' },
      disabled: { label: 'Vô hiệu hóa', bg: 'bg-slate-900', text: 'text-slate-500', border: 'border-slate-800' },
    };

    const c = config[status] || config.disabled;
    return (
      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Banner & Security Guidelines */}
      <div className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Quản lý phiên trình duyệt Google Flow cô lập</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Mỗi phiên sử dụng một thư mục User Data riêng biệt. Bạn có thể mở trình duyệt để đăng nhập Google thủ công một lần. Hệ thống không lưu mật khẩu, không trích xuất cookie và không bypass CAPTCHA.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Session Mới</span>
        </button>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sessions.map((session) => {
          const isTesting = testingId === session.id;
          const isAttention = session.status === 'auth_required' || session.status === 'quota_exhausted';

          return (
            <div
              key={session.id}
              className={`p-6 rounded-2xl border bg-[#0d1322] space-y-5 transition-all ${
                isAttention ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-slate-800'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{session.name}</h4>
                    <p className="text-[11px] font-mono text-slate-500">{session.id}</p>
                  </div>
                </div>

                <div>{getStatusBadge(session.status)}</div>
              </div>

              {/* Status Note or Warning */}
              {session.notes && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    isAttention ? 'bg-amber-950/40 border border-amber-500/30 text-amber-200' : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {isAttention && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                  <span className="truncate">{formatNote(session.notes)}</span>
                </div>
              )}

              {/* Profile directory info */}
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{session.profileDir}</span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                {/* Open Browser (Sign In) */}
                <button
                  onClick={() => handleOpenBrowser(session)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mở trình duyệt (Đăng nhập)</span>
                </button>

                {/* Test Connection */}
                <button
                  disabled={isTesting}
                  onClick={() => handleTestConnection(session)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
                </button>

                {/* Direct Go-to-Image button if Ready */}
                {session.status === 'ready' && (
                  <button
                    onClick={() => setActiveTab('image')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
                    title="Chuyển ngay sang màn hình Tạo ảnh"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tạo ảnh</span>
                  </button>
                )}

                {/* Pause / Resume */}
                {session.status === 'paused' ? (
                  <button
                    onClick={() => updateStatus(session.id, 'ready')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700"
                    title="Tiếp tục phiên"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(session.id, 'paused')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700"
                    title="Tạm dừng phiên"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Remove Session */}
                <button
                  onClick={() => removeSession(session.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-500 hover:text-rose-400 border border-slate-700 transition-colors ml-auto"
                  title="Xóa phiên"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Session Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-400" />
                <span>Thêm Session Google Flow Mới</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Tạo hồ sơ trình duyệt Chromium cô lập. Sau khi tạo, hãy bấm <strong>"Mở trình duyệt (Đăng nhập)"</strong> để đăng nhập tài khoản Google Flow của bạn một cách an toàn.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên Session</label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="vd: Tài khoản Google #2"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Hủy
              </button>
              <button
                onClick={handleAddSession}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all"
              >
                Tạo Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
