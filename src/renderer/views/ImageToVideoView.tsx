import React, { useState } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useOutputStore } from '../store/output-store.ts';
import { useAppStore } from '../store/app-store.ts';
import {
  Film,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Play,
  RotateCw,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';

export const ImageToVideoView: React.FC = () => {
  const { jobs, createJob, approveJob, cancelJob } = useQueueStore();
  const { outputs } = useOutputStore();
  const { setActiveTab, addNotification } = useAppStore();

  const [activeMode, setActiveMode] = useState<'pipeline' | 'from-existing'>('pipeline');

  // Pipeline form state
  const [imagePrompt, setImagePrompt] = useState('A cinematic portrait of an ancient sorceress with glowing amethyst eyes, intricate gold crown, soft candlelight');
  const [videoPrompt, setVideoPrompt] = useState('Camera slowly pushes in towards sorceress as she raises her hand, magical glowing particles swirling around her fingers, cinematic lighting');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [duration, setDuration] = useState(5);

  // Existing image mode state
  const [selectedImageFile, setSelectedImageFile] = useState('');
  const [customVideoPrompt, setCustomVideoPrompt] = useState('');

  // Jobs waiting for review
  const waitingJobs = jobs.filter((j) => j.status === 'waiting_for_user');
  // Completed image jobs
  const completedImageJobs = jobs.filter((j) => j.type === 'image' && j.status === 'completed' && j.outputFile);

  const handleCreatePipeline = async () => {
    if (!imagePrompt.trim() || !videoPrompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập cả prompt ảnh và video.' });
      return;
    }

    // 1. Create Image job
    const imgJob = await createJob({
      name: `Image Stage - ${new Date().toLocaleTimeString()}`,
      type: 'image',
      provider: 'nano_banana',
      prompt: imagePrompt.trim(),
      aspectRatio,
      requiresApproval,
    });

    if (!imgJob) {
      addNotification({ type: 'error', message: 'Không thể tạo job ảnh.' });
      return;
    }

    // 2. Create dependent Video job
    await createJob({
      name: `Video Stage - ${new Date().toLocaleTimeString()}`,
      type: 'video',
      provider: 'veo_3',
      prompt: videoPrompt.trim(),
      aspectRatio,
      duration,
      dependencyJobId: imgJob.id,
    });

    addNotification({
      type: 'success',
      message: `Đã tạo pipeline Ảnh → Video (${requiresApproval ? 'Chờ duyệt sau khi ảnh hoàn tất' : 'Tự động tiếp tục'}).`,
    });

    setActiveTab('queue');
  };

  const handleCreateFromExisting = async () => {
    if (!selectedImageFile || !customVideoPrompt.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng chọn ảnh và nhập prompt video.' });
      return;
    }

    await createJob({
      name: `Video from Image - ${new Date().toLocaleTimeString()}`,
      type: 'video',
      provider: 'veo_3',
      prompt: customVideoPrompt.trim(),
      aspectRatio: '16:9',
      duration: 5,
      referenceImageUrl: selectedImageFile,
    });

    addNotification({
      type: 'success',
      message: 'Đã tạo job Video sử dụng ảnh đã chọn làm khung tham chiếu.',
    });

    setActiveTab('queue');
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Pending Reviews Banner (if any) */}
      {waitingJobs.length > 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-indigo-950/40 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="text-base font-bold text-white">Ảnh đang chờ duyệt (Waiting for Approval)</h3>
          </div>
          <p className="text-xs text-slate-300">
            Các job ảnh dưới đây đã tạo thành công và đang chờ bạn phê duyệt trước khi engine Veo 3 bắt đầu render video:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {waitingJobs.map((job) => (
              <div key={job.id} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">{job.name}</h4>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">{job.prompt}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Cần duyệt
                  </span>
                </div>

                {job.outputFile && (
                  <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 truncate">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{job.outputFile}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => approveJob(job.id)}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Duyệt ảnh & Bắt đầu Video</span>
                  </button>
                  <button
                    onClick={() => cancelJob(job.id)}
                    className="py-2 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    Hủy pipeline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => setActiveMode('pipeline')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeMode === 'pipeline' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Quy trình chuỗi khép kín (Full Pipeline)</span>
          {activeMode === 'pipeline' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveMode('from-existing')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeMode === 'from-existing' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Chọn ảnh có sẵn → Tạo Video</span>
          {activeMode === 'from-existing' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
          )}
        </button>
      </div>

      {activeMode === 'pipeline' ? (
        /* Full Pipeline Form */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Step 1: Image Generation */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bước 1: Tạo ảnh gốc (Nano Banana)</h3>
                  <p className="text-xs text-slate-400">Ảnh chân dung hoặc bối cảnh chính</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Prompt ảnh</label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={4}
                  className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tỷ lệ khung hình</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="16:9">Nằm ngang (16:9 - Điện ảnh)</option>
                  <option value="9:16">Dọc (9:16 - Reels)</option>
                  <option value="1:1">Vuông (1:1)</option>
                </select>
              </div>
            </div>

            {/* Step 2: Video Generation */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 font-bold text-xs flex items-center justify-center border border-violet-500/30">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bước 2: Diễn hoạt thành video (Veo 3)</h3>
                  <p className="text-xs text-slate-400">Chuyển động camera & tương tác nhân vật</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Prompt chuyển động Video</label>
                <textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={4}
                  className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Thời lượng</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value={5}>5 Giây (5s)</option>
                  <option value={10}>10 Giây (10s)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Workflow Controls Card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="review-toggle"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
              />
              <label htmlFor="review-toggle" className="text-xs sm:text-sm text-slate-300 cursor-pointer">
                <span className="font-bold text-white block">Chờ người dùng duyệt ảnh trước khi tạo video</span>
                <span className="text-xs text-slate-400">
                  Khi bật, bạn có thể kiểm tra ảnh kết quả. Chỉ khi bạn bấm "Duyệt" thì job video mới bắt đầu chạy.
                </span>
              </label>
            </div>

            <button
              onClick={handleCreatePipeline}
              className="py-3 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <Film className="w-4 h-4" />
              <span>Khởi tạo Pipeline Liên hoàn</span>
            </button>
          </div>
        </div>
      ) : (
        /* From Existing Image Form */
        <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Chọn ảnh đầu ra sẵn có làm Reference Frame</h3>
            <p className="text-xs text-slate-400">Chọn từ danh sách các ảnh đã được tạo thành công trên máy:</p>
          </div>

          {completedImageJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              Chưa có ảnh nào hoàn thành trong lịch sử job. Hãy tạo ảnh mới trước.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {completedImageJobs.map((j) => {
                const isSelected = selectedImageFile === j.outputFile;
                return (
                  <div
                    key={j.id}
                    onClick={() => setSelectedImageFile(j.outputFile!)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/15 text-white'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold truncate">{j.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{j.prompt}</p>
                    <p className="text-[10px] text-indigo-400 font-mono truncate mt-2">{j.outputFile?.split(/[\\/]/).pop()}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Prompt chuyển động Video cho ảnh đã chọn</label>
            <textarea
              value={customVideoPrompt}
              onChange={(e) => setCustomVideoPrompt(e.target.value)}
              placeholder="Mô tả cảnh chuyển động và biến đổi sang video..."
              rows={3}
              className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            disabled={!selectedImageFile || !customVideoPrompt.trim()}
            onClick={handleCreateFromExisting}
            className="py-3 px-6 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Film className="w-4 h-4" />
            <span>Tạo Video từ ảnh này</span>
          </button>
        </div>
      )}
    </div>
  );
};
