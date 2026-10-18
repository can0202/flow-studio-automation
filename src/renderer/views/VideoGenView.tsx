import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useSessionStore } from '../store/session-store.ts';
import { useAppStore } from '../store/app-store.ts';
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
  const { createJob, jobs } = useQueueStore();
  const { sessions } = useSessionStore();
  const { setActiveTab, addNotification } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [model, setModel] = useState('veo-3.0');
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (generateNow = false) => {
    if (!prompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập prompt tạo video.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const jobName = name.trim() || `Veo 3-${new Date().toLocaleTimeString()}`;

      await createJob({
        name: jobName,
        type: 'video',
        provider: 'veo_3',
        prompt: prompt.trim(),
        model,
        aspectRatio,
        duration,
        referenceImageUrl: referenceImageUrl.trim() || undefined,
        sessionId: selectedSessionId || undefined,
        projectName,
      });

      addNotification({
        type: 'success',
        message: 'Đã thêm job tạo video Veo 3 vào hàng đợi.',
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
          {/* Prompt card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-400" />
                <span>Prompt tạo video (Veo 3 Engine)</span>
              </label>
              <span className="text-xs font-mono text-slate-500">{prompt.length} ký tự</span>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Mô tả chuyển động camera, ánh sáng, hành động nhân vật (vd: Camera quay pan điện ảnh qua rừng mưa phát sáng lúc hoàng hôn, bào tử phát sáng lơ lẫng, 4k)..."
              rows={4}
              className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none"
            />

            {/* Camera Motion Presets */}
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
                {[5, 10].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setDuration(sec)}
                    className={`flex-1 py-2.5 px-4 rounded-xl border text-center font-bold text-sm transition-all ${
                      duration === sec
                        ? 'bg-violet-600/15 border-violet-500 text-violet-400'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec} Giây ({sec}s)
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced details */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-sm font-bold text-white">Tùy chọn nâng cao</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tên Video Job</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="vd: Flycam Hoàng hôn"
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

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Ảnh tham chiếu (Start Frame / Reference Image)</label>
                <input
                  type="text"
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="Đường dẫn tuyệt đối tới ảnh bắt đầu (vd: C:\output\images\frame.png)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
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
            </div>

            {/* Action buttons */}
            <div className="pt-4 flex items-center gap-3">
              <button
                disabled={isSubmitting || !prompt.trim()}
                onClick={() => handleCreate(false)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm vào Queue</span>
              </button>

              <button
                disabled={isSubmitting || !prompt.trim()}
                onClick={() => handleCreate(true)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Tạo Video & Mở Hàng đợi</span>
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
