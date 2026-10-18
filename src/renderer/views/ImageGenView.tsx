import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import { useAppStore } from '../store/app-store.ts';
import { JOB_STATUS_NAMES, SESSION_STATUS_NAMES } from '../../shared/types.ts';
import {
  Sparkles,
  Layers,
  Image as ImageIcon,
  Folder,
  Send,
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';

const ASPECT_RATIOS = [
  { id: '1:1', label: 'Vuông (1:1)', icon: 'w-6 h-6 border-2 border-current rounded' },
  { id: '16:9', label: 'Nằm ngang (16:9)', icon: 'w-8 h-4.5 border-2 border-current rounded' },
  { id: '9:16', label: 'Dọc (9:16)', icon: 'w-4.5 h-8 border-2 border-current rounded' },
  { id: '4:3', label: 'Chuẩn (4:3)', icon: 'w-7 h-5 border-2 border-current rounded' },
  { id: '3:4', label: 'Thẳng đứng (3:4)', icon: 'w-5 h-7 border-2 border-current rounded' },
];

const PRESET_TEMPLATES = [
  {
    title: 'Chân dung Studio Thực tế',
    prompt: 'A cinematic high-fashion portrait of a woman with neon rim lighting, captured on 85mm f/1.4 lens, 8k resolution, photorealistic, intricate fabric textures',
    aspectRatio: '3:4',
  },
  {
    title: 'Thành phố Cyberpunk',
    prompt: 'Futuristic dystopian Tokyo cyberpunk alleyway at rainy twilight, holographic advertisements, reflective puddle reflections, cinematic atmosphere, octane render',
    aspectRatio: '16:9',
  },
  {
    title: 'Fantasy Anime',
    prompt: 'Studio Ghibli inspired majestic floating castle among luminous clouds, golden sunset rays, mystical creatures flying, vibrant pastel color palette',
    aspectRatio: '16:9',
  },
  {
    title: 'Diorama 3D Isometric',
    prompt: 'Cute isometric 3D miniature cozy coffee shop with tiny customers, soft ambient lighting, pastel clay render style, tilt-shift photography',
    aspectRatio: '1:1',
  },
];

export const ImageGenView: React.FC = () => {
  const { createJob, jobs } = useQueueStore();
  const { sessions } = useSessionStore();
  const { setActiveTab, addNotification } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [model, setModel] = useState('imagen-3.0');
  const [batchCount, setBatchCount] = useState(1);
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (generateNow = false) => {
    if (!prompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập prompt tạo ảnh.' });
      return;
    }

    setIsSubmitting(true);
    try {
      for (let i = 0; i < batchCount; i++) {
        const jobName = name.trim()
          ? batchCount > 1
            ? `${name.trim()} (#${i + 1})`
            : name.trim()
          : `Nano Banana-${new Date().toLocaleTimeString()}`;

        await createJob({
          name: jobName,
          type: 'image',
          provider: 'nano_banana',
          prompt: prompt.trim(),
          model,
          aspectRatio,
          referenceImageUrl: referenceImageUrl.trim() || undefined,
          sessionId: selectedSessionId || undefined,
          projectName,
        });
      }

      addNotification({
        type: 'success',
        message: `Đã thêm ${batchCount} job tạo ảnh vào hàng đợi.`,
      });

      if (generateNow) {
        setActiveTab('queue');
      } else {
        setPrompt('');
        setName('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const recentImageJobs = jobs.filter((j) => j.type === 'image').slice(0, 4);

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Form: Prompt and Parameters (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prompt card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Prompt tạo ảnh (Nano Banana / Imagen)</span>
              </label>
              <span className="text-xs font-mono text-slate-500">{prompt.length} ký tự</span>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Mô tả cảnh chi tiết (vd: Chân dung phi hành gia trên sao Hỏa đang cầm cầu sáng cổ xưa, ánh sáng điện ảnh, 8k)..."
              rows={4}
              className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />

            {/* Quick Preset Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Gợi ý mẫu (Presets):</span>
              <div className="flex flex-wrap gap-2">
                {PRESET_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(tpl.prompt);
                      setAspectRatio(tpl.aspectRatio);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Aspect Ratios card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <label className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Tỷ lệ khung hình (Aspect Ratio)</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {ASPECT_RATIOS.map((ratio) => {
                const isSelected = aspectRatio === ratio.id;
                return (
                  <button
                    key={ratio.id}
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="h-9 flex items-center justify-center text-current">
                      <div className={ratio.icon} />
                    </div>
                    <span className="text-xs font-semibold">{ratio.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced options card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-sm font-bold text-white">Tùy chọn nâng cao</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên Job (Tùy chọn)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="vd: Nhân vật Cyberpunk"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Model Engine</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="imagen-3.0">Imagen 3.0 (Nhanh &amp; Sắc nét)</option>
                  <option value="nano-banana-pro">Nano Banana Pro (Flow Studio)</option>
                  <option value="imagen-3.0-ultra">Imagen 3.0 Ultra (Chất lượng cao)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Số lượng tạo (Batch Count)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên thư mục Project</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Ảnh tham chiếu (Reference Image Path)</label>
                <input
                  type="text"
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="Đường dẫn tuyệt đối tới ảnh tham chiếu (vd: C:\Users\...\pose.png)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Phiên Google Flow (Session)</label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Tự động chọn phiên sẵn sàng (Auto-assign)</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({SESSION_STATUS_NAMES[s.status] || s.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submit Action Buttons */}
            <div className="pt-4 flex items-center gap-3">
              <button
                disabled={isSubmitting || !prompt.trim()}
                onClick={() => handleCreate(false)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm vào Queue ({batchCount})</span>
              </button>

              <button
                disabled={isSubmitting || !prompt.trim()}
                onClick={() => handleCreate(true)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Tạo & Chuyển sang Hàng đợi</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Recent Creations & Information (1 col) */}
        <div className="space-y-6">
          {/* Quick info box */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
              <span>Nano Banana Pipeline</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tạo ảnh đơn lẻ hoặc hàng loạt với persistent queue SQLite. Khi generation hoàn tất, ảnh được lưu an toàn tại local và có thể làm đầu vào cho quy trình <strong>Image → Video</strong> tiếp theo.
            </p>
          </div>

          {/* Recent image jobs */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-sm font-bold text-white">Ảnh gần đây</h3>
            {recentImageJobs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Chưa có job ảnh nào.</p>
            ) : (
              <div className="space-y-3">
                {recentImageJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">{job.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          job.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : job.status === 'running'
                            ? 'bg-indigo-500/10 text-indigo-400 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {JOB_STATUS_NAMES[job.status] || job.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{job.prompt}</p>
                    {job.outputFile && (
                      <div className="pt-1 flex items-center justify-between text-[11px] text-indigo-400 font-mono">
                        <span className="truncate max-w-[180px]">{job.outputFile.split(/[\\/]/).pop()}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
