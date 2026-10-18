import React from 'react';
import { useAppStore } from '../store/app-store.ts';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import { JOB_STATUS_NAMES } from '../../shared/types.ts';
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  Globe,
  Zap,
  ArrowRight,
  RotateCw,
  Plus,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { stats, settings, setActiveTab } = useAppStore();
  const { jobs, createJob, retryFailed, approveJob } = useQueueStore();
  const { sessions } = useSessionStore();

  const kpis = [
    { label: 'Job đang chờ', value: stats?.pending || 0, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Đang xử lý', value: stats?.running || 0, icon: Play, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    { label: 'Chờ duyệt', value: stats?.waiting_for_user || 0, icon: UserCheck, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    { label: 'Hoàn thành', value: stats?.completed || 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Thất bại', value: stats?.failed || 0, icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    { label: 'Phiên hoạt động', value: stats?.activeSessions || 0, icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  ];

  const recentJobs = jobs.slice(0, 6);

  // Quick simulation triggers
  const handleSimulateImage = () => {
    createJob({
      name: 'Simulated Nano Banana Image',
      type: 'image',
      prompt: 'A cyberpunk street food vendor in neo Tokyo at night with rain and neon reflections',
      aspectRatio: '16:9',
    });
  };

  const handleSimulateVideo = () => {
    createJob({
      name: 'Simulated Veo 3 Video',
      type: 'video',
      prompt: 'Cinematic drone shot flying through a bioluminescent futuristic valley, sunset golden hour',
      aspectRatio: '16:9',
      duration: 5,
    });
  };

  const handleSimulateRetry = () => {
    createJob({
      name: 'Test Retry with Backoff',
      type: 'image',
      prompt: 'High-speed sports car drifting on a wet asphalt circuit [TEST_RETRY]',
      aspectRatio: '1:1',
      maxRetries: 3,
    });
  };

  const handleSimulateQuota = () => {
    createJob({
      name: 'Test Quota Protection',
      type: 'image',
      prompt: 'Abstract geometric crystalline sculptures in deep space [TEST_QUOTA]',
      aspectRatio: '1:1',
    });
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Simulation Banner & Quick Test Bar */}
      {settings?.simulationMode && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-indigo-950/30 border border-amber-500/30 shadow-lg relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                  <Zap className="w-5 h-5 fill-amber-400 text-amber-400" />
                </span>
                <h3 className="text-base font-bold text-white">Chế độ Giả lập đang bật (Mock Provider)</h3>
              </div>
              <p className="text-xs text-amber-200/80 mt-1 max-w-2xl">
                Ứng dụng đang chạy ở Chế độ Giả lập. Thử nghiệm logic hàng đợi, đồng thời, giải quyết phụ thuộc, retry backoff và lưu file cục bộ mà không gửi yêu cầu tới Google Flow.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSimulateImage}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm job ảnh</span>
              </button>
              <button
                onClick={handleSimulateVideo}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm job video</span>
              </button>
              <button
                onClick={handleSimulateRetry}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Kiểm tra Retry</span>
              </button>
              <button
                onClick={handleSimulateQuota}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Kiểm tra Quota</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border glass-panel flex flex-col justify-between hover:scale-[1.02] transition-transform duration-200`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{kpi.label}</span>
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-extrabold text-white tracking-tight">{kpi.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attention Alert if any session is in auth_required or quota_exhausted */}
      {sessions.some((s) => s.status === 'auth_required' || s.status === 'quota_exhausted') && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <div>
              <h4 className="text-sm font-bold text-rose-200">Phiên cần chú ý</h4>
              <p className="text-xs text-rose-300/80">
                Một hoặc nhiều phiên trình duyệt gặp giới hạn quota hoặc cần đăng nhập Google.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('sessions')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5"
          >
            <span>Quản lý phiên</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Recent Activity & Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Jobs (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#0d1322] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Hoạt động Job gần đây</h3>
              <p className="text-xs text-slate-400">Tiến độ trực tiếp và chuyển đổi trạng thái trong hàng đợi SQLite bền vững</p>
            </div>
            <div className="flex items-center gap-2">
              {(stats?.failed || 0) > 0 && (
                <button
                  onClick={retryFailed}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Thử lại thất bại</span>
                </button>
              )}
              <button
                onClick={() => setActiveTab('queue')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>Xem tất cả</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {recentJobs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Chưa có job nào. Nhấn "+ Thêm job ảnh" hoặc truy cập Tạo ảnh để bắt đầu.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentJobs.map((job) => {
                const isImage = job.type === 'image';
                return (
                  <div
                    key={job.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 flex items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          isImage
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                        }`}
                      >
                        {job.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">{job.name}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-md">{job.prompt}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status badge */}
                      <span
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                          job.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : job.status === 'running' || job.status === 'downloading'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                            : job.status === 'waiting_for_user'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            : job.status === 'failed'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {JOB_STATUS_NAMES[job.status] || job.status}
                      </span>

                      {/* Action button if waiting for approval */}
                      {job.status === 'waiting_for_user' && (
                        <button
                          onClick={() => approveJob(job.id)}
                          className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold"
                        >
                          Duyệt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sessions Status (1 col) */}
        <div className="rounded-2xl border border-slate-800 bg-[#0d1322] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Phiên hoạt động</h3>
              <p className="text-xs text-slate-400">Hồ sơ trình duyệt Google Flow</p>
            </div>
            <button
              onClick={() => setActiveTab('sessions')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Quản lý
            </button>
          </div>

          <div className="space-y-3">
            {sessions.map((session) => {
              const statusColors: Record<string, string> = {
                ready: 'bg-emerald-400',
                busy: 'bg-indigo-400 animate-pulse',
                auth_required: 'bg-amber-400',
                quota_exhausted: 'bg-rose-400',
                disabled: 'bg-slate-500',
                paused: 'bg-slate-400',
              };

              return (
                <div
                  key={session.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusColors[session.status] || 'bg-slate-500'}`} />
                      <span className="text-xs font-semibold text-slate-200 truncate">{session.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                      {session.notes || session.profileDir.split(/[\\/]/).pop()}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {session.status.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setActiveTab('sessions')}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors"
            >
              + Thêm / Cấu hình Phiên
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
