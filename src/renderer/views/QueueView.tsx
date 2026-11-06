import React, { useState, useEffect } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useAppStore } from '../store/app-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import type { Job, CreateJobInput, JobType } from '../../shared/types.ts';
import { JOB_STATUS_NAMES } from '../../shared/types.ts';
import {
  Play,
  Pause,
  RotateCw,
  Trash2,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  X,
  FileText,
  FolderOpen,
  Cpu,
  Layers,
  ArrowRightLeft,
  User,
  Users,
  ChevronDown,
  Loader2,
} from 'lucide-react';

export const QueueView: React.FC = () => {
  const {
    jobs,
    loadJobs,
    retryJob,
    cancelJob,
    approveJob,
    deleteJob,
    clearCompleted,
    clearAll,
    retryFailed,
    createBatchJobs,
    transferSessionJobs,
    pauseSessionJobs,
    resumeSessionJobs,
  } = useQueueStore();
  const { isQueueRunning, toggleQueue, settings, updateSettings, addNotification, loadStats } = useAppStore();
  const { sessions } = useSessionStore();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Change account modal state
  const [changeSessionJob, setChangeSessionJob] = useState<Job | null>(null);
  const [selectedNewSessionId, setSelectedNewSessionId] = useState<string>('');
  const [applyToBatch, setApplyToBatch] = useState<boolean>(true);
  const [isUpdatingSession, setIsUpdatingSession] = useState<boolean>(false);

  // Quota exhausted modal state
  const [quotaExhaustedModal, setQuotaExhaustedModal] = useState<{
    isOpen: boolean;
    sessionId: string;
    sessionName: string;
    pendingCount: number;
    jobName: string;
  } | null>(null);
  const [quotaAction, setQuotaAction] = useState<'transfer' | 'pause'>('transfer');
  const [targetSessionId, setTargetSessionId] = useState<string>('');
  const [bannerTargetMap, setBannerTargetMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (window.api?.onQuotaExhausted) {
      const unsub = window.api.onQuotaExhausted((data) => {
        setQuotaExhaustedModal({
          isOpen: true,
          ...data,
        });
        setQuotaAction('transfer');
        setTargetSessionId('');
      });
      return unsub;
    }
  }, []);

  const runningJobs = jobs.filter((j) => j.status === 'running' || j.status === 'downloading');

  // Sessions that are quota_exhausted or paused AND have paused jobs awaiting transfer
  const quotaAlertSessions = sessions.filter(
    (s) => (s.status === 'quota_exhausted' || s.status === 'paused') && jobs.some((j) => j.sessionId === s.id && j.status === 'paused')
  );

  // Batch import modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importAspectRatio, setImportAspectRatio] = useState('16:9');
  const [previewItems, setPreviewItems] = useState<CreateJobInput[]>([]);

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'running'
        ? job.status === 'running' || job.status === 'downloading'
        : job.status === filterStatus;

    const matchesSearch =
      job.name.toLowerCase().includes(search.toLowerCase()) ||
      job.prompt.toLowerCase().includes(search.toLowerCase()) ||
      job.id.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const statusTabs = [
    { id: 'all', label: 'Tất cả', count: jobs.length },
    { id: 'pending', label: 'Đang chờ', count: jobs.filter((j) => j.status === 'pending').length },
    { id: 'running', label: 'Đang chạy', count: jobs.filter((j) => j.status === 'running' || j.status === 'downloading').length },
    { id: 'waiting_for_user', label: 'Chờ duyệt', count: jobs.filter((j) => j.status === 'waiting_for_user').length },
    { id: 'completed', label: 'Hoàn thành', count: jobs.filter((j) => j.status === 'completed').length },
    { id: 'failed', label: 'Thất bại', count: jobs.filter((j) => j.status === 'failed').length },
    { id: 'interrupted', label: 'Bị ngắt', count: jobs.filter((j) => j.status === 'interrupted').length },
  ];

  // Parse batch input (supports Plain Text line-by-line, CSV, and JSON)
  const handleParseImport = (text: string, customRatio = importAspectRatio) => {
    setImportText(text);
    if (!text.trim()) {
      setPreviewItems([]);
      return;
    }

    try {
      // Try JSON first
      if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
        const parsed = JSON.parse(text);
        const array = Array.isArray(parsed) ? parsed : [parsed];
        const items: CreateJobInput[] = array.map((item, i) => ({
          name: item.name || `Batch Job #${i + 1}`,
          type: (item.type === 'video' ? 'video' : 'image') as JobType,
          prompt: item.prompt || '',
          aspectRatio: item.aspectRatio || customRatio,
          duration: item.duration || 5,
          model: item.model || '',
        })).filter((item) => item.prompt.trim() !== '');

        setPreviewItems(items);
        return;
      }
    } catch {}

    // Parse plain lines / CSV
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const items: CreateJobInput[] = [];

    // Check if line 0 is a CSV header
    const isCsvHeader = lines[0]?.toLowerCase().startsWith('prompt,');
    const startIndex = isCsvHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if line matches structured CSV: "prompt", type, ratio, duration
      const csvQuotedMatch = line.match(/^"(.+)",\s*(image|video)(?:,\s*([0-9:]+))?(?:,\s*(\d+))?$/i);
      if (csvQuotedMatch) {
        items.push({
          name: `Batch #${items.length + 1}`,
          prompt: csvQuotedMatch[1].trim(),
          type: csvQuotedMatch[2].toLowerCase() as any,
          aspectRatio: csvQuotedMatch[3] || customRatio,
          duration: parseInt(csvQuotedMatch[4] || '5') || 5,
        });
      } else if (isCsvHeader && line.includes(',')) {
        // Fallback for CSV header mode
        const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
        items.push({
          name: `Batch #${items.length + 1}`,
          prompt: parts[0],
          type: (parts[1]?.toLowerCase() === 'video' ? 'video' : 'image') as any,
          aspectRatio: parts[2] || customRatio,
          duration: parseInt(parts[3] || '5') || 5,
        });
      } else {
        // Plain text mode: Each line is a complete prompt (preserves all internal commas!)
        items.push({
          name: `Batch #${items.length + 1}`,
          prompt: line,
          type: 'image',
          aspectRatio: customRatio,
          duration: 5,
        });
      }
    }

    setPreviewItems(items);
  };

  const loadCsvTemplate = () => {
    const template = `prompt,type,aspectRatio,duration
"Neon cyberpunk warrior standing under rain in futuristic alleyway",image,16:9,5
"Close up macro shot of iridescent hummingbird drinking nectar",image,1:1,5
"Drone camera sweeping over snowy mountain ridge at golden sunrise",video,16:9,5
"Portrait of elderly watchmaker working in vintage Swiss workshop",image,3:4,5
"Cinematic continuous orbit around futuristic spacecraft landing on Mars",video,16:9,10`;
    handleParseImport(template);
  };

  const handleConfirmEnqueue = async () => {
    if (previewItems.length === 0) return;
    const imageCount = previewItems.filter((i) => i.type === 'image').length;
    const videoCount = previewItems.filter((i) => i.type === 'video').length;
    const imgBatchId = imageCount > 1 ? `batch_${Date.now()}_img_${Math.random().toString(36).slice(2, 6)}` : undefined;
    const vidBatchId = videoCount > 1 ? `batch_${Date.now()}_vid_${Math.random().toString(36).slice(2, 6)}` : undefined;
    let imgIdx = 0;
    let vidIdx = 0;
    const itemsWithBatch = previewItems.map((item) => {
      if (item.type === 'image' && imgBatchId) {
        imgIdx++;
        return {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            batchId: imgBatchId,
            batchIndex: imgIdx,
            batchTotal: imageCount,
            isBatch: true,
          },
        };
      }
      if (item.type === 'video' && vidBatchId) {
        vidIdx++;
        return {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            batchId: vidBatchId,
            batchIndex: vidIdx,
            batchTotal: videoCount,
            isBatch: true,
          },
        };
      }
      return item;
    });

    await createBatchJobs(itemsWithBatch);
    addNotification({
      type: 'success',
      message: `Đã thêm ${previewItems.length} job vào hàng đợi SQLite.`,
    });
    setIsImportModalOpen(false);
    setImportText('');
    setPreviewItems([]);
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Queue Start/Pause */}
          <button
            onClick={toggleQueue}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
              isQueueRunning
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-[#5F2CFF]/20'
            }`}
          >
            {isQueueRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Tạm dừng hàng đợi</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Bắt đầu hàng đợi</span>
              </>
            )}
          </button>

          {/* Retry Failed */}
          <button
            onClick={retryFailed}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#1A0A4A] border border-[#C4CEFF] transition-colors flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#5F2CFF]" />
            <span>Thử lại thất bại</span>
          </button>

          {/* Clear Completed */}
          <button
            onClick={clearCompleted}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-rose-50 text-rose-500 border border-rose-200 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Xóa đã hoàn thành</span>
          </button>

          {/* Clear All Queue */}
          <button
            onClick={async () => {
              if (jobs.length === 0) return;
              if (window.confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách hàng đợi không? Thao tác này sẽ dọn sạch tất cả các job đang chờ và hoàn thành.')) {
                await clearAll();
                addNotification({ type: 'info', message: 'Đã xóa toàn bộ hàng đợi.' });
              }
            }}
            disabled={jobs.length === 0}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-rose-50 disabled:opacity-40 text-rose-500 border border-rose-200 transition-colors flex items-center gap-1.5"
            title="Xóa toàn bộ tác vụ trong hàng đợi SQLite"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Xóa tất cả hàng đợi</span>
          </button>

          {/* Batch Import */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#5F2CFF] border border-[#C4CEFF] transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập hàng loạt (CSV / JSON)</span>
          </button>
        </div>

        {/* Concurrency Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#4A4070]">Đồng thời:</span>
          <select
            value={settings?.concurrencyLimit || 1}
            onChange={(e) => updateSettings({ concurrencyLimit: parseInt(e.target.value) || 1 })}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-[#C4CEFF] text-xs font-bold text-[#1A0A4A] focus:outline-none"
          >
            <option value={1}>1 job một lúc</option>
            <option value={2}>2 job đồng thời</option>
            <option value={3}>3 job đồng thời</option>
            <option value={4}>4 job đồng thời</option>
          </select>
        </div>
      </div>

      {/* Multi-Worker Active Lanes */}
      {runningJobs.length > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#F0F3FF] to-white border border-[#5F2CFF]/25 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="text-xs font-bold text-[#1A0A4A] uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[#5F2CFF]" />
                <span>Các Luồng Đang Hoạt Động Song Song ({runningJobs.length}/{settings?.concurrencyLimit || 1} Luồng)</span>
              </h3>
            </div>
            <span className="text-[11px] font-medium text-[#4A4070]">
              1 tài khoản = 1 luồng riêng biệt
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runningJobs.map((rJob, idx) => {
              const sessionObj = sessions.find((s) => s.id === rJob.sessionId);
              return (
                <div
                  key={rJob.id}
                  className="p-3.5 rounded-xl bg-[#F0F3FF]/90 border border-[#5F2CFF]/20 space-y-2 hover:border-[#5F2CFF]/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#5F2CFF]/15 text-[#7B52FF] border border-[#5F2CFF]/25">
                      LUỒNG #{idx + 1}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      {rJob.progress || 10}%
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A0A4A] truncate">
                      <span>👤</span>
                      <span className="truncate">{sessionObj?.name || 'Tài khoản chưa định danh'}</span>
                    </div>
                    <div className="text-[11px] text-[#4A4070] truncate flex items-center gap-1">
                      <span className="text-[#8B85B8]">Dự án:</span>
                      <span className="text-[#4A4070] font-medium">{rJob.metadata?.projectName || 'FlowStudioProject'}</span>
                    </div>
                    <div className="text-[11px] text-[#4A4070] truncate font-semibold">
                      {rJob.name}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-[#F0F3FF] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#5F2CFF] to-emerald-400 transition-all duration-300"
                      style={{ width: `${rJob.progress || 10}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quota Alert Banners — persistent for all sessions with quota_exhausted + paused jobs */}
      {quotaAlertSessions.map((s) => {
        const pausedCount = jobs.filter((j) => j.sessionId === s.id && j.status === 'paused').length;
        const bannerTarget = bannerTargetMap[s.id] || '';
        const availableSessions = sessions.filter((x) => x.id !== s.id && x.status === 'ready');
        return (
          <div
            key={s.id}
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-700">
                    {s.status === 'quota_exhausted'
                      ? `⛔ Tài khoản "${s.name}" đã hết Quota hôm nay`
                      : `⚠️ Tài khoản "${s.name}" tạm dừng (Google phát hiện tần suất nhanh)`}
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    <span className="font-bold text-[#1A0A4A]">{pausedCount} tác vụ</span> đang bị tạm dừng.
                    Chọn tài khoản khác để chạy tiếp, hoặc chờ để tiếp tục.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {availableSessions.length > 0 ? (
                  <>
                    <select
                      value={bannerTarget}
                      onChange={(e) => setBannerTargetMap((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#C4CEFF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF] min-w-[160px]"
                    >
                      <option value="">-- Chọn tài khoản --</option>
                      {availableSessions.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} (Sẵn sàng)
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!bannerTarget}
                      onClick={async () => {
                        const res = await resumeSessionJobs(s.id, bannerTarget);
                        addNotification({
                          type: 'success',
                          message: `Đã chuyển ${res.count} tác vụ từ "${s.name}" sang tài khoản mới. Hàng đợi tiếp tục!`,
                        });
                        setBannerTargetMap((prev) => ({ ...prev, [s.id]: '' }));
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Chạy tiếp
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-[#8B85B8] italic px-2">
                    Không có tài khoản sẵn sàng
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Status Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {statusTabs.map((tab) => {
            const isActive = filterStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#5F2CFF] text-white'
                    : 'text-[#4A4070] hover:text-[#1A0A4A] hover:bg-[#E8ECFF]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-[#E8ECFF] text-[#1A0A4A]' : 'bg-[#F0F3FF] text-[#4A4070]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-[#8B85B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm prompt hoặc ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs text-[#1A0A4A] placeholder:text-[#8B85B8] focus:outline-none focus:border-[#5F2CFF]"
          />
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-2xl border border-[#E2E6FF] bg-white overflow-hidden">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center text-[#8B85B8] text-xs">
            Không tìm thấy job nào phù hợp.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E6FF] bg-white/80 text-[11px] font-bold text-[#4A4070] uppercase tracking-wider">
                  <th className="py-3 px-4">Loại</th>
                  <th className="py-3 px-4">Tên & Prompt</th>
                  <th className="py-3 px-4">Tài khoản</th>
                  <th className="py-3 px-4">Trạng thái & Tiến độ</th>
                  <th className="py-3 px-4">Thử lại</th>
                  <th className="py-3 px-4">Tạo lúc</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E6FF] text-xs">
                {filteredJobs.map((job) => {
                  const isImage = job.type === 'image';
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="hover:bg-white/50 cursor-pointer transition-colors"
                    >
                      {/* Type Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isImage
                              ? 'bg-[#5F2CFF]/10 text-[#5F2CFF] border border-[#5F2CFF]/20'
                              : 'bg-[#7B52FF]/10 text-[#7B52FF] border border-[#7B52FF]/20'
                          }`}
                        >
                          {job.type}
                        </span>
                      </td>

                      {/* Name & Prompt */}
                      <td className="py-3 px-4 max-w-md">
                        <p className="font-semibold text-[#1A0A4A] truncate">{job.name}</p>
                        <p className="text-[11px] text-[#4A4070] truncate">{job.prompt}</p>
                        {job.dependencyJobId && (
                          <span className="text-[10px] text-sky-700 font-mono">
                            ↳ Liên kết với job cha {job.dependencyJobId}
                          </span>
                        )}
                      </td>

                      {/* Session / Account */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChangeSessionJob(job);
                            setSelectedNewSessionId(job.sessionId || '');
                            setApplyToBatch(Boolean(job.metadata?.batchId));
                          }}
                          title="Bấm để đổi tài khoản khác cho job này"
                          className="group inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#F0F3FF] hover:bg-[#E8EDFF] text-[#4A4070] hover:text-[#5F2CFF] border border-[#C4CEFF]/80 hover:border-[#5F2CFF] transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <User className="w-3 h-3 text-[#5F2CFF] shrink-0" />
                          <span className="truncate max-w-[130px]">
                            {job.sessionId
                              ? sessions.find((s) => s.id === job.sessionId)?.name || 'Phiên #' + job.sessionId.slice(-4)
                              : 'Tự động chọn'}
                          </span>
                          <ChevronDown className="w-3 h-3 text-[#5F2CFF] opacity-60 group-hover:opacity-100 group-hover:translate-y-0.5 transition-all shrink-0" />
                        </button>
                      </td>

                      {/* Status & Progress */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              job.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-600'
                                : job.status === 'running' || job.status === 'downloading'
                                ? 'bg-[#5F2CFF]/10 text-[#5F2CFF] animate-pulse'
                                : job.status === 'waiting_for_user'
                                ? 'bg-sky-50 text-sky-700'
                                : job.status === 'failed'
                                ? 'bg-rose-50 text-rose-600'
                                : job.status === 'interrupted'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-[#F0F3FF] text-[#4A4070]'
                            }`}
                          >
                            {JOB_STATUS_NAMES[job.status] || job.status}
                          </span>

                          {(job.status === 'running' || job.status === 'downloading') && (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-[#F0F3FF] overflow-hidden">
                                <div
                                  className="h-full bg-[#5F2CFF] transition-all duration-300"
                                  style={{ width: `${job.progress || 10}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-mono font-medium text-[#5F2CFF]">
                                {job.progress || 10}%
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Retries */}
                      <td className="py-3 px-4 text-[#4A4070] font-mono text-[11px]">
                        {job.retryCount > 0 ? (
                          <span className="text-amber-700 font-semibold">{job.retryCount}/{job.maxRetries}</span>
                        ) : (
                          <span>0/{job.maxRetries}</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="py-3 px-4 text-[#4A4070] text-[11px]">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                        {job.status === 'waiting_for_user' && (
                          <button
                            onClick={() => approveJob(job.id)}
                            className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-[#1A0A4A] font-bold text-[11px]"
                          >
                            Duyệt
                          </button>
                        )}

                        {(job.status === 'failed' || job.status === 'interrupted' || job.status === 'cancelled') && (
                          <button
                            onClick={() => retryJob(job.id)}
                            className="p-1.5 rounded hover:bg-[#F0F3FF] text-[#5F2CFF]"
                            title="Thử lại job"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {(job.status === 'pending' || job.status === 'running') && (
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="p-1.5 rounded hover:bg-[#F0F3FF] text-amber-700"
                            title="Hủy job"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => deleteJob(job.id)}
                          className="p-1.5 rounded hover:bg-[#F0F3FF] text-[#8B85B8] hover:text-rose-600"
                          title="Xóa job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch Import Modal with Live Preview */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#E2E6FF] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1A0A4A] flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#5F2CFF]" />
                  <span>Nhập Prompts hàng loạt (CSV / JSON)</span>
                </h3>
                <p className="text-xs text-[#4A4070]">Xem trước prompt trước khi đưa vào hàng đợi</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-[#4A4070] hover:text-[#1A0A4A] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-[#4A4070]">Dán danh sách Prompts:</span>
                  <p className="text-[11px] text-[#8B85B8]">Mỗi dòng là 1 prompt (tự do), hoặc theo định dạng CSV / JSON</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#4A4070]">Tỷ lệ:</span>
                  <div className="flex bg-white border border-[#E2E6FF] rounded-lg p-0.5">
                    {['16:9', '1:1', '9:16', '4:3', '3:4'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setImportAspectRatio(r);
                          handleParseImport(importText, r);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                          importAspectRatio === r
                            ? 'bg-[#5F2CFF] text-white font-bold'
                            : 'text-[#4A4070] hover:text-[#1A0A4A]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={loadCsvTemplate}
                    className="text-xs font-semibold text-[#5F2CFF] hover:text-[#7B52FF] ml-2"
                  >
                    CSV Mẫu
                  </button>
                </div>
              </div>

              <textarea
                value={importText}
                onChange={(e) => handleParseImport(e.target.value)}
                placeholder="Dán danh sách 100 prompt vào đây (mỗi dòng 1 prompt)...&#10;Ví dụ:&#10;Stopping a vehicle in front of the security gate, chibi cartoon style...&#10;A cute cat barista serving coffee in cozy rainy cafe...&#10;Cyberpunk city market at sunset with neon reflections..."
                rows={6}
                className="w-full p-3 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs font-mono text-[#1A0A4A] placeholder:text-[#4A4070] focus:outline-none focus:border-[#5F2CFF] resize-none"
              />

              {/* Live Preview Section */}
              {previewItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A0A4A]">
                      Bản xem trước ({previewItems.length} jobs hợp lệ):
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E2E6FF] bg-[#F0F3FF]/80 divide-y divide-[#E2E6FF]">
                    {previewItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1A0A4A] truncate">{item.prompt}</p>
                          <span className="text-[10px] text-[#4A4070]">
                            Tỷ lệ: {item.aspectRatio} | Thời lượng: {item.duration}s
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0 ${
                            item.type === 'video'
                              ? 'bg-[#7B52FF]/10 text-[#7B52FF]'
                              : 'bg-[#5F2CFF]/10 text-[#5F2CFF]'
                          }`}
                        >
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E2E6FF] bg-white/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#4A4070] hover:text-[#1A0A4A]"
              >
                Hủy
              </button>
              <button
                disabled={previewItems.length === 0}
                onClick={handleConfirmEnqueue}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Thêm {previewItems.length} Job vào Hàng đợi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded uppercase font-extrabold ${
                    selectedJob.type === 'video'
                      ? 'bg-[#5F2CFF]/10 text-[#7B52FF] border border-[#7B52FF]/25'
                      : 'bg-[#5F2CFF]/15 text-[#5F2CFF] border border-[#5F2CFF]/25'
                  }`}
                >
                  {selectedJob.type}
                </span>
                <h3 className="text-sm font-bold text-[#1A0A4A] truncate max-w-xs">{selectedJob.name}</h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-[#4A4070] hover:text-[#1A0A4A] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt */}
            <div className="p-3 rounded-xl bg-white border border-[#E2E6FF] shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-[#8B85B8] uppercase">PROMPT</span>
              <p className="text-xs text-[#1A0A4A] leading-relaxed">{selectedJob.prompt}</p>
            </div>

            {/* Error Message if failed */}
            {selectedJob.errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-500 text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase text-rose-600">CHI TIẾT LỖI</span>
                <p>{selectedJob.errorMessage}</p>
              </div>
            )}

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E6FF]">
                <span className="text-[10px] text-[#8B85B8] block">Trạng thái:</span>
                <span className="font-semibold text-[#1A0A4A]">{JOB_STATUS_NAMES[selectedJob.status] || selectedJob.status}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E6FF]">
                <span className="text-[10px] text-[#8B85B8] block">Tỷ lệ khung hình:</span>
                <span className="font-semibold text-[#1A0A4A]">{selectedJob.aspectRatio}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E6FF]">
                <span className="text-[10px] text-[#8B85B8] block">Thời lượng / Số lần thử:</span>
                <span className="font-semibold text-[#1A0A4A]">{selectedJob.duration}s | Lần thử {selectedJob.retryCount}/{selectedJob.maxRetries}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E6FF]">
                <span className="text-[10px] text-[#8B85B8] block">Mã Job:</span>
                <span className="font-mono text-[10px] text-[#4A4070] truncate block">{selectedJob.id}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/80 border border-[#E2E6FF] flex items-center justify-between col-span-2">
                <div>
                  <span className="text-[10px] text-[#8B85B8] block">Tài khoản thực hiện:</span>
                  <span className="font-semibold text-[#1A0A4A]">
                    {selectedJob.sessionId
                      ? sessions.find((s) => s.id === selectedJob.sessionId)?.name || 'Phiên #' + selectedJob.sessionId.slice(-4)
                      : 'Tự động chọn'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChangeSessionJob(selectedJob);
                    setSelectedNewSessionId(selectedJob.sessionId || '');
                    setApplyToBatch(Boolean(selectedJob.metadata?.batchId));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#5F2CFF]/10 hover:bg-[#5F2CFF]/20 text-[#5F2CFF] text-[11px] font-bold border border-[#5F2CFF]/30 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <User className="w-3 h-3" />
                  <span>Đổi tài khoản</span>
                </button>
              </div>
            </div>

            {/* Output File Info */}
            {selectedJob.outputFile && (
              <div className="p-3 rounded-xl bg-white border border-[#E2E6FF] shadow-sm flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] text-emerald-600 font-bold block">FILE ĐẦU RA</span>
                  <span className="text-xs font-mono text-[#4A4070] truncate block">{selectedJob.outputFile}</span>
                </div>
                <button
                  onClick={() => window.api.openFile(selectedJob.outputFile!)}
                  className="px-3 py-1.5 rounded-lg bg-[#5F2CFF] hover:bg-[#7B52FF] text-white text-xs font-semibold shrink-0"
                >
                  Mở file
                </button>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#4A4070]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quota Exhausted Confirmation Modal */}
      {quotaExhaustedModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-amber-200 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#1A0A4A]">Tài khoản hết Quota hôm nay</h3>
                <p className="text-xs text-[#4A4070] leading-relaxed">
                  Tài khoản <span className="font-bold text-amber-700">"{quotaExhaustedModal.sessionName}"</span> đã dùng hết hạn mức tín dụng Google Flow.
                </p>
                <p className="text-xs text-[#4A4070]">
                  Hiện còn <span className="font-bold text-[#1A0A4A]">{quotaExhaustedModal.pendingCount} tác vụ</span> của chủ đề này trong hàng đợi.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs">
              <label className="font-semibold text-[#4A4070] block">
                Chọn phương án xử lý:
              </label>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="quotaAction"
                    checked={quotaAction === 'transfer'}
                    onChange={() => setQuotaAction('transfer')}
                    className="mt-0.5 text-[#5F2CFF] focus:ring-0"
                  />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold text-[#1A0A4A] block">Chuyển sang tài khoản khác</span>
                    <span className="text-[11px] text-[#4A4070] block">
                      Tiếp tục chạy các tác vụ còn lại trên một tài khoản sẵn sàng khác.
                    </span>
                    {quotaAction === 'transfer' && (
                      <select
                        value={targetSessionId}
                        onChange={(e) => setTargetSessionId(e.target.value)}
                        className="w-full mt-2 px-3 py-2 rounded-lg bg-[#F4F6FF] border border-[#C4CEFF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                      >
                        <option value="">-- Chọn tài khoản chuyển giao --</option>
                        {sessions
                          .filter((s) => s.id !== quotaExhaustedModal.sessionId && s.status === 'ready')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} (Sẵn sàng)
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-[#E2E6FF]">
                  <input
                    type="radio"
                    name="quotaAction"
                    checked={quotaAction === 'pause'}
                    onChange={() => setQuotaAction('pause')}
                    className="mt-0.5 text-[#5F2CFF] focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-[#1A0A4A] block">Tạm dừng các tác vụ này</span>
                    <span className="text-[11px] text-[#4A4070] block">
                      Giữ nguyên dự án, để mai khi tài khoản hồi quota thì bấm chạy tiếp.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setQuotaExhaustedModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4A4070] hover:text-[#1A0A4A]"
              >
                Đóng
              </button>
              <button
                disabled={quotaAction === 'transfer' && !targetSessionId}
                onClick={async () => {
                  if (quotaAction === 'transfer' && targetSessionId) {
                    // Jobs are already 'paused' — resumeSessionJobs sets them back to pending on new account
                    const res = await resumeSessionJobs(quotaExhaustedModal!.sessionId, targetSessionId);
                    addNotification({
                      type: 'success',
                      message: `Đã chuyển ${res.count} tác vụ sang tài khoản mới. Hàng đợi tiếp tục!`,
                    });
                  } else if (quotaAction === 'pause') {
                    // Jobs are already paused by the queue system — just inform user
                    addNotification({
                      type: 'info',
                      message: `${quotaExhaustedModal!.pendingCount} tác vụ của "${quotaExhaustedModal!.sessionName}" đang tạm dừng. Dùng banner cảnh báo ở trên để chuyển tài khoản bất cứ lúc nào.`,
                    });
                  }
                  setQuotaExhaustedModal(null);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Xác nhận thực hiện
              </button>
            </div>
          </div>
        </div>
      )}
          {/* Modal: Đổi tài khoản thực hiện Job */}
      {changeSessionJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-[#E2E6FF] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 border-b border-[#E2E6FF] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#5F2CFF]/10 text-[#5F2CFF]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1A0A4A]">Chọn tài khoản thực hiện</h3>
                  <p className="text-[11px] text-[#8B85B8]">
                    Job: <span className="font-semibold text-[#4A4070]">{changeSessionJob.name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChangeSessionJob(null)}
                className="text-[#8B85B8] hover:text-[#1A0A4A] p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt preview */}
            <div className="p-2.5 rounded-xl bg-[#F8F9FE] border border-[#E2E6FF] text-xs text-[#4A4070]">
              <span className="font-semibold text-[#1A0A4A]">Prompt: </span>
              <span className="line-clamp-2">{changeSessionJob.prompt}</span>
            </div>

            {/* List of sessions */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#1A0A4A] block">
                Chọn tài khoản:
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {/* Auto assign option */}
                <div
                  onClick={() => setSelectedNewSessionId('')}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedNewSessionId === ''
                      ? 'bg-[#5F2CFF]/10 border-[#5F2CFF] text-[#5F2CFF] font-bold shadow-xs'
                      : 'bg-white border-[#E2E6FF] hover:bg-slate-50 text-[#4A4070]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center shrink-0">
                      {selectedNewSessionId === '' && <div className="w-2 h-2 rounded-full bg-[#5F2CFF]" />}
                    </div>
                    <span>🤖 Tự động chọn (Bất kỳ phiên sẵn sàng nào)</span>
                  </div>
                </div>

                {/* Session list */}
                {sessions.map((s) => {
                  const isCurrent = changeSessionJob.sessionId === s.id;
                  const isSelected = selectedNewSessionId === s.id;
                  const isReady = s.status === 'ready';
                  const isExhausted = s.status === 'quota_exhausted';

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedNewSessionId(s.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#5F2CFF]/10 border-[#5F2CFF] text-[#1A0A4A] font-bold shadow-xs'
                          : 'bg-white border-[#E2E6FF] hover:bg-slate-50 text-[#4A4070]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center shrink-0">
                          {isSelected && <div className="w-2 h-2 rounded-full bg-[#5F2CFF]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{s.name}</span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-[#8B85B8] font-normal border">
                                Hiện tại
                              </span>
                            )}
                          </div>
                          {s.quotaInfo && (
                            <span className="text-[10px] text-[#8B85B8] block font-normal">
                              {s.quotaInfo}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 uppercase ${
                          isReady
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : isExhausted
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isReady ? 'Sẵn sàng' : isExhausted ? 'Hết quota' : s.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Batch toggle if job belongs to a batch */}
            {changeSessionJob.metadata?.batchId && (
              <div className="p-3 rounded-xl bg-[#F0F3FF] border border-[#C4CEFF] text-xs space-y-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#1A0A4A]">
                  <input
                    type="checkbox"
                    checked={applyToBatch}
                    onChange={(e) => setApplyToBatch(e.target.checked)}
                    className="w-4 h-4 text-[#5F2CFF] rounded border-[#C4CEFF] focus:ring-[#5F2CFF]"
                  />
                  <span>Áp dụng cho tất cả job đang chờ / thất bại cùng lô</span>
                </label>
                <p className="text-[11px] text-[#4A4070] pl-6">
                  Tất cả các tác vụ cùng dự án chưa hoàn tất sẽ được chuyển sang tài khoản này.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E6FF]">
              <button
                type="button"
                onClick={() => setChangeSessionJob(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4A4070] hover:bg-slate-100 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isUpdatingSession}
                onClick={async () => {
                  try {
                    setIsUpdatingSession(true);
                    const res = await window.api.updateJobSession(
                      changeSessionJob.id,
                      selectedNewSessionId,
                      applyToBatch
                    );
                    await loadJobs();
                    await loadStats();
                    const targetName = selectedNewSessionId
                      ? sessions.find((s) => s.id === selectedNewSessionId)?.name || 'tài khoản mới'
                      : 'chế độ tự động';
                    addNotification({
                      type: 'success',
                      message: applyToBatch && res.updatedCount > 1
                        ? `Đã chuyển ${res.updatedCount} tác vụ sang "${targetName}"!`
                        : `Đã đổi tài khoản thành "${targetName}"!`,
                    });
                    setChangeSessionJob(null);
                  } catch (err: any) {
                    addNotification({
                      type: 'error',
                      message: `Lỗi đổi tài khoản: ${err?.message || 'Thất bại'}`,
                    });
                  } finally {
                    setIsUpdatingSession(false);
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingSession && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Xác nhận đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
