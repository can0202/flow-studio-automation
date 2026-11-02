import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import { useAppStore } from '../store/app-store.ts';
import { JOB_STATUS_NAMES, SESSION_STATUS_NAMES, CreateJobInput } from '../../shared/types.ts';
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
  Pin,
  PinOff,
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
  const { createJob, createBatchJobs, jobs } = useQueueStore();
  const { sessions } = useSessionStore();
  const { setActiveTab, addNotification } = useAppStore();

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [model, setModel] = useState('imagen-3.0');
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [batchCount, setBatchCount] = useState(1);
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [pinSession, setPinSession] = useState(false);
  const [lastAddedInfo, setLastAddedInfo] = useState<{ count: number; sessionName: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const promptLines = prompt
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const handleCreate = async (generateNow = false) => {
    if (isBatchMode) {
      if (promptLines.length === 0) {
        addNotification({ type: 'warning', message: 'Vui lòng nhập danh sách ít nhất 1 prompt.' });
        return;
      }

      setIsSubmitting(true);
      try {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const batchInputs: CreateJobInput[] = promptLines.map((p, idx) => ({
          name: name.trim() ? `${name.trim()} (#${idx + 1})` : `Nano Banana (#${idx + 1})`,
          type: 'image',
          provider: 'nano_banana',
          prompt: p,
          model,
          aspectRatio,
          referenceImageUrl: referenceImageUrl.trim() || undefined,
          sessionId: selectedSessionId || undefined,
          projectName,
          repeatCount,
          metadata: {
            batchId,
            batchIndex: idx + 1,
            batchTotal: promptLines.length,
            isBatch: true,
          },
        }));

        await createBatchJobs(batchInputs);
        const sessionName = selectedSessionId
          ? (sessions.find((s) => s.id === selectedSessionId)?.name ?? selectedSessionId)
          : 'Tự động';
        addNotification({
          type: 'success',
          message: `Đã thêm ${batchInputs.length} job vào hàng đợi → ${sessionName}!`,
        });
        setLastAddedInfo({ count: batchInputs.length, sessionName });

        if (generateNow) {
          setActiveTab('queue');
        } else {
          setPrompt('');
          setName('');
          // If not pinning, reset session so user must re-select intentionally
          if (!pinSession) setSelectedSessionId('');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!prompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập prompt tạo ảnh.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const singleBatchId = batchCount > 1 ? `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : undefined;
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
          repeatCount,
          metadata: singleBatchId
            ? {
              batchId: singleBatchId,
              batchIndex: i + 1,
              batchTotal: batchCount,
              isBatch: true,
            }
            : undefined,
        });
      }

      addNotification({
        type: 'success',
        message: `Đã thêm ${batchCount} job tạo ảnh vào hàng đợi.`,
      });

      const sessionName = selectedSessionId
        ? (sessions.find((s) => s.id === selectedSessionId)?.name ?? selectedSessionId)
        : 'Tự động';
      setLastAddedInfo({ count: batchCount, sessionName });
      if (generateNow) {
        setActiveTab('queue');
      } else {
        setPrompt('');
        setName('');
        if (!pinSession) setSelectedSessionId('');
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
          {/* Mode Switcher Tabs */}
          <div className="flex bg-white border border-[#E2E6FF] rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setIsBatchMode(false)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${!isBatchMode
                ? 'bg-[#5F2CFF] text-white shadow-md'
                : 'text-[#4A4070] hover:text-[#1A0A4A]'
                }`}
            >
              Tạo Đơn Lẻ
            </button>
            <button
              type="button"
              onClick={() => setIsBatchMode(true)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${isBatchMode
                ? 'bg-[#5F2CFF] text-white shadow-md'
                : 'text-[#4A4070] hover:text-[#1A0A4A]'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tạo Hàng Loạt</span>
            </button>
          </div>

          {/* Prompt card */}
          <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#5F2CFF]" />
                <span>
                  {isBatchMode
                    ? 'Danh sách Prompts hàng loạt (Mỗi dòng 1 prompt)'
                    : 'Prompt tạo ảnh (Nano Banana / Imagen)'}
                </span>
              </label>
              {isBatchMode ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#5F2CFF]/15 text-[#7B52FF] border border-[#5F2CFF]/25">
                  {promptLines.length} prompts phát hiện
                </span>
              ) : (
                <span className="text-xs font-mono text-[#8B85B8]">{prompt.length} ký tự</span>
              )}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isBatchMode
                  ? 'Dán danh sách 100 prompt vào đây, mỗi dòng là một prompt riêng biệt...\nVí dụ:\nStopping a vehicle in front of the security gate, chibi cartoon style...\nA cute cat barista serving hot coffee in rainy afternoon cafe...\nCyberpunk neon Tokyo street market with reflective puddles, 8k...'
                  : 'Mô tả cảnh chi tiết (vd: Chân dung phi hành gia trên sao Hỏa đang cầm cầu sáng cổ xưa, ánh sáng điện ảnh, 8k)...'
              }
              rows={isBatchMode ? 8 : 4}
              className="w-full p-4 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] placeholder:text-[#8B85B8] focus:outline-none focus:border-[#5F2CFF] focus:ring-1 focus:ring-[#5F2CFF] transition-all resize-none font-mono"
            />

            {/* Quick Preset Buttons (only in single mode) */}
            {!isBatchMode && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#4A4070]">Gợi ý mẫu (Presets):</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPrompt(tpl.prompt);
                        setAspectRatio(tpl.aspectRatio);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white hover:bg-[#F0F3FF] text-[#4A4070] border border-[#E2E6FF] transition-colors"
                    >
                      {tpl.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Aspect Ratios card */}
          <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-4">
            <label className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#5F2CFF]" />
              <span>Tỷ lệ khung hình (Aspect Ratio)</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {ASPECT_RATIOS.map((ratio) => {
                const isSelected = aspectRatio === ratio.id;
                return (
                  <button
                    key={ratio.id}
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${isSelected
                      ? 'bg-[#5F2CFF] border-[#5F2CFF] text-white shadow-sm'
                      : 'bg-white/80 border-[#E2E6FF] text-[#4A4070] hover:text-[#1A0A4A] hover:border-[#C4CEFF]'
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

          {/* Repeat Multiplier card (x1, x2, x3, x4) */}
          <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#5F2CFF]" />
                <span>Số lượng ảnh tạo mỗi lần trên Web (Multiplier)</span>
              </label>
              <span className="text-xs text-amber-700 font-medium">
                Mặc định x1 (Tiết kiệm credit, web mặc định x2)
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((cnt) => {
                const isSelected = repeatCount === cnt;
                return (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setRepeatCount(cnt)}
                    className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${isSelected
                      ? 'bg-[#5F2CFF] border-[#5F2CFF] text-white shadow-sm'
                      : 'bg-white/80 border-[#E2E6FF] text-[#4A4070] hover:text-[#1A0A4A] hover:border-[#C4CEFF]'
                      }`}
                  >
                    <span className="text-base font-bold font-mono">x{cnt}</span>
                    <span className="text-[10px]">
                      {cnt === 1 ? '1 ảnh / prompt' : `${cnt} ảnh / prompt`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced options card */}
          <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-4">
            <h3 className="text-sm font-bold text-[#1A0A4A]">Tùy chọn nâng cao</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Tên Job (Tùy chọn)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="vd: Nhân vật Cyberpunk"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] placeholder:text-[#4A4070] focus:outline-none focus:border-[#5F2CFF]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Model Engine</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                >
                  <option value="imagen-3.0">Imagen 3.0 (Nhanh &amp; Sắc nét)</option>
                  <option value="nano-banana-pro">Nano Banana Pro (Flow Studio)</option>
                  <option value="imagen-3.0-ultra">Imagen 3.0 Ultra (Chất lượng cao)</option>
                </select>
              </div>

              {!isBatchMode && (
                <div>
                  <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Số lượng tạo lặp lại</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={batchCount}
                    onChange={(e) => setBatchCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                  />
                </div>
              )}

              <div className={isBatchMode ? 'sm:col-span-1' : ''}>
                <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Tên thư mục Project</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Ảnh tham chiếu (Reference Image Path - Tùy chọn)</label>
                <input
                  type="text"
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="Đường dẫn tuyệt đối tới ảnh tham chiếu (vd: C:\Users\...\pose.png)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] placeholder:text-[#4A4070] focus:outline-none focus:border-[#5F2CFF] font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#4A4070] block">
                    👤 Tài khoản phụ trách (Session)
                  </label>
                  {/* Pin session toggle */}
                  <button
                    type="button"
                    title={pinSession ? 'Đang ghim tài khoản — click để bỏ ghim' : 'Ghim tài khoản này cho lô tiếp theo'}
                    onClick={() => {
                      const next = !pinSession;
                      setPinSession(next);
                      if (!next) setLastAddedInfo(null);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all ${pinSession
                      ? 'bg-[#5F2CFF] text-white border border-[#5F2CFF] hover:bg-[#5F2CFF]/30'
                      : 'bg-[#F0F3FF] text-[#8B85B8] border border-[#C4CEFF] hover:text-[#4A4070]'
                      }`}
                  >
                    {pinSession ? <Pin size={11} /> : <PinOff size={11} />}
                    {pinSession ? 'Đã ghim' : 'Ghim tài khoản'}
                  </button>
                </div>

                <select
                  value={selectedSessionId}
                  onChange={(e) => { setSelectedSessionId(e.target.value); setLastAddedInfo(null); }}
                  className={`w-full px-3 py-2 rounded-xl bg-white text-sm text-[#1A0A4A] focus:outline-none transition-all ${pinSession && selectedSessionId
                    ? 'border border-[#5F2CFF]/70 ring-1 ring-[#5F2CFF]/30'
                    : 'border border-[#E2E6FF] focus:border-[#5F2CFF]'
                    }`}
                >
                  <option value="">Tự động chọn phiên sẵn sàng (Auto-assign)</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({SESSION_STATUS_NAMES[s.status] || s.status})
                    </option>
                  ))}
                </select>

                {/* Last-added confirmation banner */}
                {lastAddedInfo && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px]">
                    <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                    <span className="text-emerald-700 leading-snug">
                      ✅ Đã thêm <strong>{lastAddedInfo.count} ảnh</strong> vào{' '}
                      <strong>{lastAddedInfo.sessionName}</strong>.{' '}
                      {pinSession
                        ? 'Tài khoản đang được ghim — dán lô tiếp theo và bấm thêm vào queue.'
                        : 'Chọn tài khoản khác để thêm lô tiếp theo.'}
                    </span>
                  </div>
                )}

                {isBatchMode && !lastAddedInfo && (
                  <p className="text-[11px] text-[#4A4070]">
                    {selectedSessionId ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <span>✓</span> Lô {promptLines.length} ảnh này sẽ gắn cố định với tài khoản đã chọn và tạo tuần tự trong cùng 1 project Google Flow.
                      </span>
                    ) : (
                      <span className="text-amber-700/90 flex items-center gap-1">
                        <span>ℹ️</span> Khuyên dùng: Chọn cố định 1 tài khoản cho lô ảnh này để chạy đa luồng an toàn.
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Action Buttons */}
            <div className="pt-4 flex items-center gap-3">
              <button
                disabled={isSubmitting || (isBatchMode ? promptLines.length === 0 : !prompt.trim())}
                onClick={() => handleCreate(false)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#1A0A4A] border border-[#C4CEFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isBatchMode
                    ? `Thêm ${promptLines.length} jobs vào Queue`
                    : `Thêm vào Queue (${batchCount})`}
                </span>
              </button>

              <button
                disabled={isSubmitting || (isBatchMode ? promptLines.length === 0 : !prompt.trim())}
                onClick={() => handleCreate(true)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-lg shadow-[#5F2CFF]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isBatchMode
                    ? `Tạo ${promptLines.length} jobs & Chuyển sang Hàng đợi`
                    : 'Tạo & Chuyển sang Hàng đợi'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Recent Creations & Information (1 col) */}
        <div className="space-y-6">
          {/* Quick info box */}
          <div className="p-5 rounded-2xl border border-[#E2E6FF] bg-white space-y-3">
            <h3 className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#5F2CFF]" />
              <span>Nano Banana Pipeline</span>
            </h3>
            <p className="text-xs text-[#4A4070] leading-relaxed">
              Tạo ảnh đơn lẻ hoặc hàng loạt với persistent queue SQLite. Khi generation hoàn tất, ảnh được lưu an toàn tại local và có thể làm đầu vào cho quy trình <strong>Image → Video</strong> tiếp theo.
            </p>
          </div>

          {/* Recent image jobs */}
          <div className="p-5 rounded-2xl border border-[#E2E6FF] bg-white space-y-4">
            <h3 className="text-sm font-bold text-[#1A0A4A]">Ảnh gần đây</h3>
            {recentImageJobs.length === 0 ? (
              <p className="text-xs text-[#8B85B8] text-center py-6">Chưa có job ảnh nào.</p>
            ) : (
              <div className="space-y-3">
                {recentImageJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-xl bg-white border border-[#E2E6FF] shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1A0A4A] truncate">{job.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${job.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-600'
                          : job.status === 'running'
                            ? 'bg-[#5F2CFF]/10 text-[#5F2CFF] animate-pulse'
                            : 'bg-[#F0F3FF] text-[#4A4070]'
                          }`}
                      >
                        {JOB_STATUS_NAMES[job.status] || job.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#4A4070] truncate">{job.prompt}</p>
                    {job.outputFile && (
                      <div className="pt-1 flex items-center justify-between text-[11px] text-[#5F2CFF] font-mono">
                        <span className="truncate max-w-[180px]">{job.outputFile.split(/[\\/]/).pop()}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
