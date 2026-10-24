import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useAppStore } from '../store/app-store.ts';
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
} from 'lucide-react';

export const QueueView: React.FC = () => {
  const {
    jobs,
    retryJob,
    cancelJob,
    approveJob,
    deleteJob,
    clearCompleted,
    clearAll,
    retryFailed,
    createBatchJobs,
  } = useQueueStore();
  const { isQueueRunning, toggleQueue, settings, updateSettings, addNotification } = useAppStore();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

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
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const imageCount = previewItems.filter((i) => i.type === 'image').length;
    let imgIdx = 0;
    const itemsWithBatch = previewItems.map((item) => {
      if (item.type === 'image' && imageCount > 1) {
        imgIdx++;
        return {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            batchId,
            batchIndex: imgIdx,
            batchTotal: imageCount,
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1322] border border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          {/* Queue Start/Pause */}
          <button
            onClick={toggleQueue}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
              isQueueRunning
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
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
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Thử lại thất bại</span>
          </button>

          {/* Clear Completed */}
          <button
            onClick={clearCompleted}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
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
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 border border-rose-500/30 transition-colors flex items-center gap-1.5"
            title="Xóa toàn bộ tác vụ trong hàng đợi SQLite"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Xóa tất cả hàng đợi</span>
          </button>

          {/* Batch Import */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập hàng loạt (CSV / JSON)</span>
          </button>
        </div>

        {/* Concurrency Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Đồng thời:</span>
          <select
            value={settings?.concurrencyLimit || 1}
            onChange={(e) => updateSettings({ concurrencyLimit: parseInt(e.target.value) || 1 })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white focus:outline-none"
          >
            <option value={1}>1 job một lúc</option>
            <option value={2}>2 job đồng thời</option>
            <option value={3}>3 job đồng thời</option>
            <option value={4}>4 job đồng thời</option>
          </select>
        </div>
      </div>

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
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
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
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm prompt hoặc ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-2xl border border-slate-800 bg-[#0d1322] overflow-hidden">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Không tìm thấy job nào phù hợp.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Loại</th>
                  <th className="py-3 px-4">Tên & Prompt</th>
                  <th className="py-3 px-4">Trạng thái & Tiến độ</th>
                  <th className="py-3 px-4">Thử lại</th>
                  <th className="py-3 px-4">Tạo lúc</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {filteredJobs.map((job) => {
                  const isImage = job.type === 'image';
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="hover:bg-slate-900/50 cursor-pointer transition-colors"
                    >
                      {/* Type Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isImage
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              : 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                          }`}
                        >
                          {job.type}
                        </span>
                      </td>

                      {/* Name & Prompt */}
                      <td className="py-3 px-4 max-w-md">
                        <p className="font-semibold text-slate-200 truncate">{job.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{job.prompt}</p>
                        {job.dependencyJobId && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            ↳ Liên kết với job cha {job.dependencyJobId}
                          </span>
                        )}
                      </td>

                      {/* Status & Progress */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              job.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : job.status === 'running' || job.status === 'downloading'
                                ? 'bg-indigo-500/10 text-indigo-400 animate-pulse'
                                : job.status === 'waiting_for_user'
                                ? 'bg-cyan-500/10 text-cyan-400'
                                : job.status === 'failed'
                                ? 'bg-rose-500/10 text-rose-400'
                                : job.status === 'interrupted'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {JOB_STATUS_NAMES[job.status] || job.status}
                          </span>

                          {(job.status === 'running' || job.status === 'downloading') && (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 transition-all duration-300"
                                  style={{ width: `${job.progress || 10}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-mono font-medium text-indigo-400">
                                {job.progress || 10}%
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Retries */}
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {job.retryCount > 0 ? (
                          <span className="text-amber-400 font-semibold">{job.retryCount}/{job.maxRetries}</span>
                        ) : (
                          <span>0/{job.maxRetries}</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                        {job.status === 'waiting_for_user' && (
                          <button
                            onClick={() => approveJob(job.id)}
                            className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px]"
                          >
                            Duyệt
                          </button>
                        )}

                        {(job.status === 'failed' || job.status === 'interrupted' || job.status === 'cancelled') && (
                          <button
                            onClick={() => retryJob(job.id)}
                            className="p-1.5 rounded hover:bg-slate-800 text-indigo-400"
                            title="Thử lại job"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {(job.status === 'pending' || job.status === 'running') && (
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="p-1.5 rounded hover:bg-slate-800 text-amber-400"
                            title="Hủy job"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => deleteJob(job.id)}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400"
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
          <div className="w-full max-w-2xl bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Nhập Prompts hàng loạt (CSV / JSON)</span>
                </h3>
                <p className="text-xs text-slate-400">Xem trước prompt trước khi đưa vào hàng đợi</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-300">Dán danh sách Prompts:</span>
                  <p className="text-[11px] text-slate-500">Mỗi dòng là 1 prompt (tự do), hoặc theo định dạng CSV / JSON</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">Tỷ lệ:</span>
                  <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
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
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={loadCsvTemplate}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 ml-2"
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
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
              />

              {/* Live Preview Section */}
              {previewItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      Bản xem trước ({previewItems.length} jobs hợp lệ):
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800">
                    {previewItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-200 truncate">{item.prompt}</p>
                          <span className="text-[10px] text-slate-400">
                            Tỷ lệ: {item.aspectRatio} | Thời lượng: {item.duration}s
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0 ${
                            item.type === 'video'
                              ? 'bg-violet-500/10 text-violet-400'
                              : 'bg-indigo-500/10 text-indigo-400'
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

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Hủy
              </button>
              <button
                disabled={previewItems.length === 0}
                onClick={handleConfirmEnqueue}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
          <div className="w-full max-w-lg bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded uppercase font-extrabold ${
                    selectedJob.type === 'video'
                      ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                      : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  }`}
                >
                  {selectedJob.type}
                </span>
                <h3 className="text-sm font-bold text-white truncate max-w-xs">{selectedJob.name}</h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">PROMPT</span>
              <p className="text-xs text-slate-200 leading-relaxed">{selectedJob.prompt}</p>
            </div>

            {/* Error Message if failed */}
            {selectedJob.errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase text-rose-400">CHI TIẾT LỖI</span>
                <p>{selectedJob.errorMessage}</p>
              </div>
            )}

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Trạng thái:</span>
                <span className="font-semibold text-slate-200">{JOB_STATUS_NAMES[selectedJob.status] || selectedJob.status}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Tỷ lệ khung hình:</span>
                <span className="font-semibold text-slate-200">{selectedJob.aspectRatio}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Thời lượng / Số lần thử:</span>
                <span className="font-semibold text-slate-200">{selectedJob.duration}s | Lần thử {selectedJob.retryCount}/{selectedJob.maxRetries}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Mã Job:</span>
                <span className="font-mono text-[10px] text-slate-400 truncate block">{selectedJob.id}</span>
              </div>
            </div>

            {/* Output File Info */}
            {selectedJob.outputFile && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] text-emerald-400 font-bold block">FILE ĐẦU RA</span>
                  <span className="text-xs font-mono text-slate-300 truncate block">{selectedJob.outputFile}</span>
                </div>
                <button
                  onClick={() => window.api.openFile(selectedJob.outputFile!)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0"
                >
                  Mở file
                </button>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
