import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import { useAppStore } from '../store/app-store.ts';
import type { CreateJobInput } from '../../shared/types.ts';
import { JOB_STATUS_NAMES, SESSION_STATUS_NAMES } from '../../shared/types.ts';
import {
  Video as VideoIcon,
  Film,
  Camera,
  Layers,
  Clock,
  Send,
  Plus,
  CheckCircle2,
  Hash,
  Link2,
  Unlink,
  Sparkles,
  ArrowRight,
  ListPlus,
  PlaySquare,
} from 'lucide-react';

const VIDEO_RATIOS = [
  { id: '16:9', label: 'Nằm ngang (16:9)', desc: 'Màn hình rộng điện ảnh' },
  { id: '9:16', label: 'Dọc (9:16)', desc: 'Shorts & Reels' },
  { id: '1:1', label: 'Vuông (1:1)', desc: 'Video bảng tin' },
];

const MOTION_PRESETS = [
  {
    title: 'Flycam Điện ảnh FPV',
    text: 'Cinematic first-person drone dive cruising through narrow canyon cliffs at high speed, sunset reflections on river below, smooth gimbal stabilization, 4k 60fps',
  },
  {
    title: 'Camera Đẩy chậm vào Chân dung',
    text: 'Slow dramatic camera push-in towards character eyes, shallow depth of field, cinematic anamorphic bokeh, gentle atmospheric haze, 35mm film grain',
  },
  {
    title: 'Orbit 360 quanh Chủ thể',
    text: 'Seamless continuous 360-degree camera orbit around futuristic mechanical warrior, sparks flying, volumetric lighting, photorealistic motion blur',
  },
  {
    title: 'Hyperlapse Đô thị',
    text: 'Fast-paced dynamic hyperlapse through futuristic mega-city skyways with light trails and towering skyscrapers, clouds moving rapidly overhead',
  },
];

export const VideoGenView: React.FC = () => {
  const { createJob, createBatchJobs, jobs } = useQueueStore();
  const { sessions } = useSessionStore();
  const { setActiveTab, addNotification } = useAppStore();

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isChaining, setIsChaining] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(8);
  const [repeatCount, setRepeatCount] = useState(1);
  const [model, setModel] = useState('veo-3.0');
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const promptLines = prompt
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const handleCreate = async (generateNow = false) => {
    // ── Batch Mode (Multiple Scenes / Sequential Video Chaining) ────────────
    if (isBatchMode) {
      if (promptLines.length === 0) {
        addNotification({ type: 'warning', message: 'Vui lòng nhập ít nhất 1 prompt cảnh video.' });
        return;
      }

      setIsSubmitting(true);
      try {
        const chainId = `vchain_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const baseJobName = name.trim() || 'Veo 3';

        if (isChaining && promptLines.length > 1) {
          // ── Sequential Video Chaining ─────────────────────────────────────
          // Job 1 runs first.
          // Job 2 has dependencyJobId = Job 1, and takes Job 1's extracted last frame.
          // Job 3 has dependencyJobId = Job 2, and takes Job 2's extracted last frame.
          // All chained jobs share the SAME batchId to run inside the same Google Flow project workspace!
          let prevJobId: string | undefined = undefined;
          for (let i = 0; i < promptLines.length; i++) {
            const p = promptLines[i];
            const job = await createJob({
              name: `${baseJobName} (Cảnh #${i + 1}/${promptLines.length})`,
              type: 'video',
              provider: 'veo_3',
              prompt: p,
              model,
              aspectRatio,
              duration,
              // Scene 1 uses initial reference image if provided; subsequent scenes wait for parent last frame
              referenceImageUrl: i === 0 && referenceImageUrl.trim() ? referenceImageUrl.trim() : undefined,
              dependencyJobId: prevJobId,
              sessionId: selectedSessionId || undefined,
              projectName,
              metadata: {
                batchId: chainId,
                batchIndex: i + 1,
                batchTotal: promptLines.length,
                isBatch: true,
                isChain: true,
                chainId,
                chainIndex: i + 1,
                chainTotal: promptLines.length,
                useParentLastFrame: i > 0,
              },
            });

            if (job) {
              prevJobId = job.id;
            }
          }

          addNotification({
            type: 'success',
            message: `Đã tạo chuỗi liên kết ${promptLines.length} video trong cùng 1 dự án! Cảnh sau sẽ tự động nhận khung hình cuối của cảnh trước.`,
          });
        } else {
          // ── Standard Batch Mode (Independent Video Jobs in SAME project) ──────────────────
          const batchId = `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const inputs: CreateJobInput[] = promptLines.map((p, idx) => ({
            name: `${baseJobName} (#${idx + 1})`,
            type: 'video',
            provider: 'veo_3',
            prompt: p,
            model,
            aspectRatio,
            duration,
            referenceImageUrl: referenceImageUrl.trim() || undefined,
            sessionId: selectedSessionId || undefined,
            projectName,
            metadata: {
              batchId,
              batchIndex: idx + 1,
              batchTotal: promptLines.length,
              isBatch: true,
            },
          }));

          await createBatchJobs(inputs);
          addNotification({
            type: 'success',
            message: `Đã thêm ${inputs.length} video jobs vào hàng đợi (tạo chung trong 1 dự án)!`,
          });
        }

        if (generateNow) {
          setActiveTab('queue');
        } else {
          setPrompt('');
          setName('');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ── Single Mode ─────────────────────────────────────────────────────────
    if (!prompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập prompt tạo video.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const baseJobName = name.trim() || `Veo 3-${new Date().toLocaleTimeString()}`;
      const baseInput = {
        type: 'video' as const,
        provider: 'veo_3' as const,
        prompt: prompt.trim(),
        model,
        aspectRatio,
        duration,
        repeatCount: 1,
        referenceImageUrl: referenceImageUrl.trim() || undefined,
        sessionId: selectedSessionId || undefined,
        projectName,
      };

      if (repeatCount <= 1) {
        await createJob({ ...baseInput, name: baseJobName });
      } else {
        const batchId = `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const inputs = Array.from({ length: repeatCount }, (_, i) => ({
          ...baseInput,
          name: `${baseJobName} #${i + 1}`,
          metadata: {
            batchId,
            batchIndex: i + 1,
            batchTotal: repeatCount,
            isBatch: true,
          },
        }));
        await createBatchJobs(inputs);
      }

      addNotification({
        type: 'success',
        message:
          repeatCount > 1
            ? `Đã thêm ${repeatCount} job tạo video Veo 3 vào hàng đợi.`
            : 'Đã thêm job tạo video Veo 3 vào hàng đợi.',
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

  const recentVideoJobs = jobs.filter((j) => j.type === 'video').slice(0, 4);

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Form: Prompt & Parameters (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mode Switcher Banner */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setIsBatchMode(false)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                !isBatchMode
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PlaySquare className="w-3.5 h-3.5" />
              <span>Tạo 1 Video (Đơn lẻ)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBatchMode(true)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                isBatchMode
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Tạo Video Hàng Loạt &amp; Nối Cảnh (Chaining)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-violet-400/20 text-violet-200 border border-violet-400/30">
                MỚI
              </span>
            </button>
          </div>

          {/* Prompt card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-400" />
                <span>
                  {isBatchMode
                    ? 'Danh sách Prompt Cảnh Video (Mỗi dòng là 1 cảnh)'
                    : 'Prompt tạo video (Veo 3 Engine)'}
                </span>
              </label>
              {isBatchMode ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {promptLines.length} cảnh (video)
                </span>
              ) : (
                <span className="text-xs font-mono text-slate-500">{prompt.length} ký tự</span>
              )}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isBatchMode
                  ? 'Dán danh sách các cảnh vào đây, mỗi dòng là một cảnh chuyển động...\nVí dụ:\nCảnh 1: Hiệp sĩ cưỡi ngựa bước vào khu rừng rậm lúc bình minh, ánh sáng len qua kẽ lá...\nCảnh 2: Hiệp sĩ dừng lại trước cánh cổng cổ phát sáng ma mị giữa các thân cây...\nCảnh 3: Cánh cổng bùng sáng vũ trụ, hút bóng lưng hiệp sĩ tan biến vào luồng sáng...'
                  : 'Mô tả chuyển động camera, ánh sáng, hành động nhân vật (vd: Camera quay pan điện ảnh qua rừng mưa phát sáng lúc hoàng hôn, bào tử phát sáng lơ lửng, 4k)...'
              }
              rows={isBatchMode ? 7 : 4}
              className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none font-mono text-xs leading-relaxed"
            />

            {/* Video Chaining Toggle Card (Only in Batch Mode) */}
            {isBatchMode && (
              <div className="p-4 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-slate-900 to-indigo-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-violet-600/20 text-violet-400 mt-0.5 shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Nối tiếp khung hình (Video Chaining)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                        Liền mạch AI
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      Tự động trích xuất <span className="text-violet-300 font-semibold">khung hình cuối (Last Frame)</span> của video trước làm ảnh tham chiếu bắt đầu cho video tiếp theo. Giữ nguyên nhân vật, góc máy và bối cảnh!
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsChaining(!isChaining)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
                    isChaining
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isChaining ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      <span>Đang Bật Nối Cảnh</span>
                    </>
                  ) : (
                    <>
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Đang Tắt (Độc Lập)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Live Sequence Timeline Visualizer (Only in Batch Mode when >= 2 scenes) */}
            {isBatchMode && promptLines.length > 1 && (
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span>Sơ đồ chuỗi kịch bản ({promptLines.length} video liên tiếp):</span>
                  </span>
                  {isChaining ? (
                    <span className="text-[10px] text-violet-400 font-semibold flex items-center gap-1">
                      <Link2 className="w-3 h-3" /> Nối frame tự động
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-medium">Tạo độc lập</span>
                  )}
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {promptLines.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-6 h-6 rounded-md bg-slate-800 text-violet-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                        <p className="text-slate-200 truncate font-mono text-[11px]">{p}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          {idx === 0 ? (
                            <span>
                              Bắt đầu từ prompt {referenceImageUrl ? '+ Ảnh tham chiếu ban đầu' : ''}
                            </span>
                          ) : isChaining ? (
                            <span className="text-violet-400 font-medium flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Tự động lấy [Frame cuối Video #{idx}] làm ảnh bắt đầu
                            </span>
                          ) : (
                            <span>Tạo độc lập</span>
                          )}
                        </div>
                      </div>
                      {idx < promptLines.length - 1 && isChaining && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Camera Motion Presets (only in single mode) */}
            {!isBatchMode && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-violet-400" />
                  <span>Kiểu chuyển động camera (Camera Motion Presets):</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MOTION_PRESETS.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(m.text)}
                      className="text-left p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800/80 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-200">{m.title}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{m.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Video Parameters (Aspect Ratio & Duration) */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-6">
            <div>
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-violet-400" />
                <span>Tỷ lệ khung hình (Aspect Ratio)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {VIDEO_RATIOS.map((ratio) => {
                  const isSelected = aspectRatio === ratio.id;
                  return (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-violet-600/15 border-violet-500 text-violet-400 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm font-bold block">{ratio.label}</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{ratio.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration Selector */}
            <div>
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-violet-400" />
                <span>Thời lượng video (Duration)</span>
              </label>
              <div className="flex gap-3">
                {[4, 6, 8, 10].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setDuration(sec)}
                    className={`flex-1 py-2.5 px-2 rounded-xl border text-center font-bold text-sm transition-all ${
                      duration === sec
                        ? 'bg-violet-600/15 border-violet-500 text-violet-400'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Video Count (Repeat) Selector (Single mode only) */}
            {!isBatchMode && (
              <div>
                <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-violet-400" />
                  <span>Số lượng video tạo ra (Count)</span>
                </label>
                <div className="flex gap-3">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      onClick={() => setRepeatCount(count)}
                      className={`flex-1 py-2.5 px-2 rounded-xl border text-center font-bold text-sm transition-all ${
                        repeatCount === count
                          ? 'bg-violet-600/15 border-violet-500 text-violet-400'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      x{count}
                    </button>
                  ))}
                </div>
                {repeatCount > 1 && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    ⚡ Sẽ tạo <span className="text-violet-400 font-bold">{repeatCount} video riêng biệt</span> từ cùng một prompt — mỗi video là một job độc lập trong hàng đợi.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Advanced details */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-sm font-bold text-white">Tùy chọn nâng cao</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  {isBatchMode ? 'Tên chuỗi Video (Prefix)' : 'Tên Video Job'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isBatchMode ? 'vd: Phim Ngắn Cyberpunk' : 'vd: Flycam Hoàng hôn'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Model Engine</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="veo-3.0">Google Veo 3.0 Standard</option>
                  <option value="veo-3.0-cinematic">Google Veo 3.0 Cinematic Ultra</option>
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên thư mục Dự án (Project)</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Phiên Google Flow (Session)</label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="">Tự động chọn phiên sẵn sàng (Auto-assign)</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({SESSION_STATUS_NAMES[s.status] || s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  {isBatchMode && isChaining
                    ? 'Ảnh bắt đầu cho Cảnh #1 (Tùy chọn - Start Frame đầu tiên)'
                    : 'Ảnh tham chiếu (Start Frame / Reference Image)'}
                </label>
                <input
                  type="text"
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="Đường dẫn tuyệt đối tới ảnh bắt đầu (vd: C:\output\images\frame.png)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 font-mono text-xs"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-4 flex items-center gap-3">
              <button
                disabled={isSubmitting || (isBatchMode ? promptLines.length === 0 : !prompt.trim())}
                onClick={() => handleCreate(false)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isBatchMode
                    ? isChaining
                      ? `Thêm ${promptLines.length} cảnh chuỗi vào Queue`
                      : `Thêm ${promptLines.length} video vào Queue`
                    : 'Thêm vào Queue'}
                </span>
              </button>

              <button
                disabled={isSubmitting || (isBatchMode ? promptLines.length === 0 : !prompt.trim())}
                onClick={() => handleCreate(true)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isBatchMode
                    ? isChaining
                      ? `Tạo chuỗi ${promptLines.length} Video & Mở Hàng đợi`
                      : `Tạo ${promptLines.length} Video & Mở Hàng đợi`
                    : 'Tạo Video & Mở Hàng đợi'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Guidelines & Recent (1 col) */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <VideoIcon className="w-4 h-4 text-violet-400" />
              <span>Veo 3 Video Automation</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Veo 3 tạo video chất lượng cao với chuyển động mượt mà. Hệ thống theo dõi trạng thái generation cho đến khi video sẵn sàng và tải trực tiếp về thư mục <code>output/Project/videos/</code>.
            </p>
            <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-500/20 text-xs text-slate-300 space-y-1.5">
              <span className="font-bold text-violet-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                Tính năng Nối tiếp Video (Chaining):
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Khi bật nối tiếp, hệ thống sẽ tự động cắt khung hình cuối cùng (Last Frame) của Video 1 và nạp làm ảnh mốc cho Video 2, giúp nhân vật và bối cảnh được giữ nguyên xuyên suốt toàn bộ bộ phim.
              </p>
            </div>
          </div>

          {/* Recent video jobs */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-sm font-bold text-white">Video gần đây</h3>
            {recentVideoJobs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Chưa có video job nào.</p>
            ) : (
              <div className="space-y-3">
                {recentVideoJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">{job.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          job.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : job.status === 'running'
                            ? 'bg-violet-500/10 text-violet-400 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {JOB_STATUS_NAMES[job.status] || job.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{job.prompt}</p>
                    {job.outputFile && (
                      <div className="pt-1 flex items-center justify-between text-[11px] text-violet-400 font-mono">
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
