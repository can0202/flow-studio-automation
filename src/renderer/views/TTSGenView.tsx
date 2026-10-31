import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../store/app-store';
import { TTSVoiceItem } from '../../shared/types';
import {
  Mic,
  Play,
  Pause,
  Download,
  FolderOpen,
  Sparkles,
  RefreshCw,
  Cpu,
  Zap,
  Volume2,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Layers,
  Search,
  Check,
  Plus,
  UserPlus,
  X,
  ChevronDown,
  Star,
  Settings,
  Smile,
  Frown,
  Wind,
  Wand2,
  Angry,
  Zap as ZapIcon,
  MessageCircle,
  Heart,
  AlertTriangle,
  Feather,
} from 'lucide-react';

// Helper lấy màu avatar theo thương hiệu VieNeu
const getVoiceAvatarBg = (name: string): string => {
  const colorMap: Record<string, string> = {
    'Trí Sáng': 'bg-[#8b5cf6]',
    'Minh Khai Ân': 'bg-[#22c55e]',
    'Hùng Kể': 'bg-[#a855f7]',
    'Gia Huy': 'bg-[#3b82f6]',
    'Lâm Mộc Hùng': 'bg-[#ea580c]',
    'Tấn Vĩnh Kế': 'bg-[#c026d3]',
    'Hà Thu Linh': 'bg-[#3b82f6]',
    'Minh Kết': 'bg-[#a855f7]',
    'Hải Kể': 'bg-[#3b82f6]',
  };
  if (colorMap[name]) return colorMap[name];
  const colors = [
    'bg-[#8b5cf6]',
    'bg-[#22c55e]',
    'bg-[#a855f7]',
    'bg-[#3b82f6]',
    'bg-[#ea580c]',
    'bg-[#ec4899]',
    'bg-[#06b6d4]',
    'bg-[#6366f1]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getRegionBadge = (region?: string) => {
  if (region === 'Miền Nam') {
    return 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40';
  }
  if (region === 'Miền Trung') {
    return 'bg-amber-950/70 text-amber-400 border border-amber-800/40';
  }
  return 'bg-sky-950/70 text-sky-400 border border-sky-800/40';
};

export const TTSGenView: React.FC = () => {
  const { settings, addNotification } = useAppStore();

  const [text, setText] = useState(
    'Bảy giờ mười lăm phút sáng.\n[pause 0.5s]\nSáng thứ Ba.\n[pause 0.5s]\n\nBạn đang ngồi ở quán cà phê vỉa hè quen thuộc, ngay góc ngã tư ngợp bóng cây xà cừ.\n[pause 0.5s]\nSài Gòn — hay Hà Nội, hay Đà Nẵng — vào giờ này luôn mang một nhịp điệu hối hả đến nghẹt thở.\n[pause 0.5s]\nNgười ta vội vã chen lên phía trước, những chiếc xe tay ga bóng loáng lướt qua nhau trong làn khói mờ ảo.\n[pause 0.5s]\n\nBạn nhấp một ngụm Robusta đá không đường. Đắng ngắt, nhưng tỉnh người.'
  );

  const [selectedVoiceId, setSelectedVoiceId] = useState('Adam bựa');
  const [speed, setSpeed] = useState(1.0);
  const [deviceMode, setDeviceMode] = useState<'auto' | 'cpu' | 'gpu'>('auto');
  const [selectedLanguage, setSelectedLanguage] = useState<'vi' | 'en'>('vi');
  const [projectName, setProjectName] = useState(settings?.defaultProjectName || 'FlowStudioProject');
  const [refAudioPath, setRefAudioPath] = useState('');

  // Voice Modal State
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'Miền Bắc' | 'Miền Trung' | 'Miền Nam'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [onlyStarFilter, setOnlyStarFilter] = useState(false);

  // Preview Voice state
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(null);
  const [playingPreviewVoice, setPlayingPreviewVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Custom Voice Add State
  const [isAddVoiceOpen, setIsAddVoiceOpen] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceAudioPath, setNewVoiceAudioPath] = useState('');
  const [newVoiceGender, setNewVoiceGender] = useState<'female' | 'male'>('female');
  const [newVoiceRegion, setNewVoiceRegion] = useState<'Miền Bắc' | 'Miền Trung' | 'Miền Nam'>('Miền Nam');
  const [newVoiceStyle, setNewVoiceStyle] = useState('Tự nhiên');
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);

  // Voice data & Hardware status
  const [voices, setVoices] = useState<TTSVoiceItem[]>([]);
  const [hasGpu, setHasGpu] = useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressDetail, setProgressDetail] = useState('');
  const [generatedAudioPath, setGeneratedAudioPath] = useState<string | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);

  // Audio preview playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [generatedSrtPath, setGeneratedSrtPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVoices();
  }, []);

  // Lắng nghe tiến trình tổng hợp TTS từ main process
  useEffect(() => {
    if (!window.api.onTtsProgress) return;
    const unsub = window.api.onTtsProgress(({ done, total, percent }) => {
      setProgressPercent(percent);
      setProgressDetail(`Đoạn ${done}/${total}`);
    });
    return unsub;
  }, []);

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const res = await window.api.ttsGetVoices();
      if (res && res.voices && res.voices.length > 0) {
        setVoices(res.voices);
        setHasGpu(res.hasGpu);
        if (!selectedVoiceId && res.voices[0]) {
          setSelectedVoiceId(res.voices[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load TTS voices:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // Tính số lượng điểm dừng [pause ...]
  const pauseCount = useMemo(() => {
    const matches = text.match(/\[pause(?:\s+[\d\.]+s?)?\]/gi);
    return matches ? matches.length : 0;
  }, [text]);

  // Đếm các thẻ cảm xúc được VieNeu hỗ trợ natively
  const emotionCount = useMemo(() => {
    const matches = text.match(/\[(cười|thở dài|laugh|sigh)\]/gi);
    return matches ? matches.length : 0;
  }, [text]);

  // Tìm voice item hiện tại
  const currentVoice = useMemo(() => {
    const found = voices.find((v) => v.id === selectedVoiceId);
    if (found) return found;
    return {
      id: selectedVoiceId || 'Adam bựa',
      name: selectedVoiceId || 'Adam bựa',
      label: selectedVoiceId || 'Adam bựa',
      gender: 'male' as const,
      region: 'Miền Bắc',
      initials: 'AB',
      isStar: true,
      lang: 'vi' as const,
    };
  }, [voices, selectedVoiceId]);

  // Bộ lọc danh sách giọng trong modal
  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      if (v.lang && v.lang !== selectedLanguage) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = v.name.toLowerCase().includes(q);
        const matchLabel = v.label.toLowerCase().includes(q);
        const matchDesc = (v.desc || '').toLowerCase().includes(q);
        if (!matchName && !matchLabel && !matchDesc) return false;
      }

      if (regionFilter !== 'all') {
        if (v.region !== regionFilter) return false;
      }

      if (genderFilter !== 'all') {
        if (v.gender !== genderFilter) return false;
      }

      if (onlyStarFilter && !v.isStar) {
        return false;
      }

      return true;
    });
  }, [voices, selectedLanguage, searchQuery, regionFilter, genderFilter, onlyStarFilter]);

  // ── Tính năng Tự động ngắt nhịp (Smart Auto-Pause) ──────────────────────────
  const handleAddCustomVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoiceName.trim() || !newVoiceAudioPath.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập tên giọng và đường dẫn file audio.' });
      return;
    }

    setIsSubmittingVoice(true);
    try {
      const res = await window.api.ttsAddVoice({
        name: newVoiceName.trim(),
        audioPath: newVoiceAudioPath.trim(),
        gender: newVoiceGender,
        region: newVoiceRegion,
        style: newVoiceStyle,
      });

      if (res.success) {
        addNotification({
          type: 'success',
          message: `Đã thêm thành công giọng đọc tiếng Việt mới: ${res.name || newVoiceName}!`,
        });
        await loadVoices();
        setSelectedVoiceId(res.name || newVoiceName);
        setIsAddVoiceOpen(false);
        setNewVoiceName('');
        setNewVoiceAudioPath('');
      } else {
        throw new Error(res.error || 'Thêm giọng đọc thất bại.');
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        message: err.message || 'Lỗi khi thêm giọng đọc mới.',
      });
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  const handleAutoPunctuate = () => {
    if (!text.trim()) return;

    let cleaned = text.replace(/\[pause(?:\s+[\d\.]+s?)?\]\s*/gi, '');

    let result = cleaned
      .replace(/([.!?])\s*(?=[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ0-9\n"“”])/g, '$1\n[pause 0.5s]\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    setText(result);
    addNotification({
      type: 'success',
      message: 'Đã tự động ngắt nhịp và thêm điểm dừng [pause 0.5s] theo cấu trúc câu!',
    });
  };

  // ── Tính năng Tự động phân tích & Thêm Cảm Xúc (Smart Emotion Detection) ────
  const handleAutoEmotions = () => {
    if (!text.trim()) return;

    let processed = text;
    let addedCount = 0;

    // Chỉ chèn các thẻ tạo biểu cảm thật trong VieNeu: [cười] và [thở dài]
    const emotionRules: Array<{ pattern: RegExp; tag: string }> = [
      // 1. Cười (tiếng cười tự nhiên)
      {
        pattern: /(ha\s*ha|hi\s*hi|haha|hihi|buồn cười|vui quá|thú vị thật|mỉm cười|bật cười|hài hước|vui lắm)([.,!?\s])/gi,
        tag: ' [cười]',
      },
      // 2. Thở dài (tiếng thở hắt ra tự nhiên)
      {
        pattern: /(mệt mỏi|chán nản|bất lực|ngao ngán|thở phào|thở hắt ra|ôi chao|than ôi|nghẹt thở|kiệt sức|chán quá)([.,!?\s])/gi,
        tag: ' [thở dài]',
      },
    ];

    emotionRules.forEach((rule) => {
      processed = processed.replace(rule.pattern, (_match, word, punct) => {
        addedCount++;
        return `${word}${punct.trim()}${rule.tag} `;
      });
    });

    processed = processed.replace(/\s{2,}/g, ' ').replace(/\n\s+/g, '\n').trim();
    setText(processed);

    if (addedCount > 0) {
      addNotification({
        type: 'success',
        message: `Đã phân tích ngữ cảnh và tự động thêm ${addedCount} thẻ cảm xúc!`,
      });
    } else {
      addNotification({
        type: 'info',
        message: 'Chưa phát hiện từ khóa cảm xúc đặc trưng. Hãy dùng thanh Chèn nhanh bên dưới.',
      });
    }
  };

  // ── Preview Giọng Đọc ───────────────────────────────────────────────────────
  const handlePreviewVoice = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();

    // Nếu đang phát chính giọng đó -> dừng phát
    if (playingPreviewVoice === voiceId) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPlayingPreviewVoice(null);
      return;
    }

    setPreviewLoadingVoice(voiceId);

    try {
      const res = await window.api.ttsPreviewVoice(voiceId);
      if (res && res.success && res.filePath) {
        if (previewAudioRef.current) {
          previewAudioRef.current.src = `app-media://file?path=${encodeURIComponent(res.filePath)}`;
          previewAudioRef.current.play();
          setPlayingPreviewVoice(voiceId);
        }
      } else {
        throw new Error(res.error || 'Không thể tạo preview giọng đọc');
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        message: `Lỗi nghe thử giọng ${voiceId}: ${err.message}`,
      });
    } finally {
      setPreviewLoadingVoice(null);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      addNotification({ type: 'warning', message: 'Vui lòng nhập văn bản cần đọc.' });
      return;
    }

    setIsGenerating(true);
    setProgressMsg('Đang tổng hợp âm thanh bằng mô hình VieNeu-TTS...');
    setProgressPercent(0);
    setProgressDetail('');
    setGeneratedAudioPath(null);
    setGeneratedSrtPath(null);

    try {
      const res = await window.api.ttsGenerate({
        text: text.trim(),
        voice: selectedVoiceId,
        speed,
        projectName: projectName.trim(),
        refAudioPath: refAudioPath.trim() || undefined,
      });

      if (res.success && res.filePath) {
        setGeneratedAudioPath(res.filePath);
        setGeneratedSrtPath(res.srtPath || null);
        setLastDuration(res.duration || null);
        addNotification({
          type: 'success',
          message: res.srtPath
            ? `Đã tạo file giọng đọc + phụ đề SRT thành công (${res.duration}s)!`
            : `Đã tạo file giọng đọc thành công (${res.duration}s)!`,
        });
      } else {
        throw new Error(res.error || 'Tạo giọng đọc thất bại.');
      }
    } catch (err: any) {
      addNotification({
        type: 'error',
        message: err.message || 'Lỗi xử lý âm thanh VieNeu-TTS.',
      });
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
      setProgressPercent(100);
    }
  };

  const handlePlayToggle = () => {
    if (!audioRef.current || !generatedAudioPath) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleRevealInExplorer = () => {
    if (generatedAudioPath) {
      window.api.revealInExplorer(generatedAudioPath);
    }
  };

  const handleRevealSrt = () => {
    if (generatedSrtPath) {
      window.api.revealInExplorer(generatedSrtPath);
    }
  };

  const handleOpenSrt = () => {
    if (generatedSrtPath) {
      window.api.openFile(generatedSrtPath);
    }
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Hidden audio for voice previews */}
      <audio
        ref={previewAudioRef}
        onEnded={() => setPlayingPreviewVoice(null)}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-violet-950/60 via-slate-900 to-indigo-950/40 border border-violet-500/30 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-violet-400">
            <Mic className="w-5 h-5" />
            <h1 className="text-lg font-bold text-white">Chuyển Văn Bản Thành Giọng Đọc (TTS)</h1>
          </div>
          <p className="text-xs text-slate-300">
            Mô hình mã nguồn mở <strong className="text-violet-300">VieNeu-TTS (48 kHz)</strong> chạy 100% Offline trên CPU/GPU của máy tính. Hỗ trợ song ngữ Tiếng Việt & Tiếng Anh.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
            {hasGpu ? (
              <>
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Tăng tốc GPU CUDA: <strong className="text-emerald-400">BẬT</strong></span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>Chế độ: <strong className="text-blue-400">ONNX CPU Engine</strong></span>
              </>
            )}
          </div>

          <button
            onClick={loadVoices}
            disabled={isLoadingVoices}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Tải lại danh sách giọng đọc"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingVoices ? 'animate-spin text-violet-400' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Text Input with Auto-Punctuation & Voice Pill */}
        <div className="lg:col-span-2 space-y-5">
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span>Nội dung văn bản</span>
              </label>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                {emotionCount > 0 && (
                  <span className="text-amber-400 font-semibold">{emotionCount} cảm xúc</span>
                )}
                <span>{text.length} ký tự</span>
              </div>
            </div>

            {/* Custom Textarea styled as Code/Text Box */}
            <div className="relative rounded-2xl border border-violet-500/30 bg-slate-950/70 p-4 shadow-inner">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập đoạn văn, kịch bản hoặc lời thoại cần chuyển thành giọng nói..."
                rows={11}
                className="w-full bg-transparent text-sm text-slate-100 font-mono focus:outline-none resize-none leading-relaxed select-text"
              />
            </div>

            {/* Bottom Toolbar: Auto-Pause, Auto-Emotions, Counter, & Voice Selector Pill */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Auto Punctuate */}
                <button
                  type="button"
                  onClick={handleAutoPunctuate}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-600/30 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Tự động thêm [pause 0.5s] vào sau các câu ngắt đoạn"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>Tự động ngắt nhịp</span>
                </button>

                {/* Auto Emotions Analysis */}
                <button
                  type="button"
                  onClick={handleAutoEmotions}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Phân tích ngữ nghĩa để tự động chèn [cười], [khóc], [thở dài] vào câu"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Phân tích cảm xúc</span>
                </button>

                <div className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-400">
                  {pauseCount} điểm dừng
                </div>
              </div>

              {/* Selected Voice Pill with "Change" button */}
              <div className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                  {currentVoice.initials || 'VN'}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-white">{currentVoice.name}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{currentVoice.gender === 'female' ? 'Nữ' : 'Nam'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className="ml-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-violet-950/60 hover:bg-violet-900/60 border border-violet-500/40 text-violet-300 transition-all flex items-center gap-1"
                >
                  <span>Change</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Quick manual emotion tag buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">Chèn nhanh biểu cảm & nhịp nghỉ:</span>
                <span className="text-[10px] text-slate-500 italic">SRT và TTS tự động loại bỏ tag lạ, không bị đọc thành tiếng</span>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {/* Cảm xúc VieNeu hỗ trợ thật sự */}
                <button
                  type="button"
                  onClick={() => setText((prev) => prev + ' [cười]')}
                  className="px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/40 text-amber-300 flex items-center gap-1.5 transition-all text-xs font-semibold shadow-sm"
                  title="Tạo tiếng cười tự nhiên trong câu"
                >
                  <span>😄</span>
                  <span>[cười]</span>
                </button>

                <button
                  type="button"
                  onClick={() => setText((prev) => prev + ' [thở dài]')}
                  className="px-3 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-600/40 text-cyan-300 flex items-center gap-1.5 transition-all text-xs font-semibold shadow-sm"
                  title="Tạo tiếng thở dài tự nhiên trong câu"
                >
                  <span>😮‍💨</span>
                  <span>[thở dài]</span>
                </button>

                <div className="h-4 w-px bg-slate-800 mx-1" />

                {/* Pause controls */}
                {(['[pause 0.3s]', '[pause 0.5s]', '[pause 1s]', '[pause 2s]'] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setText((prev) => prev + '\n' + tag + '\n')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-violet-950/60 hover:border-violet-600/40 border border-slate-700/60 text-slate-300 text-xs transition-all flex items-center gap-1"
                  >
                    <Clock className="w-3 h-3 text-violet-400" />
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Voice Cloning / Reference Audio (Optional) */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Voice Cloning Tức Thì (Tùy chọn)
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 font-bold uppercase">
                Instant Clone
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Tải lên đường dẫn file ghi âm mẫu (3 - 8 giây) để nhân bản giọng đọc bất kỳ:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={refAudioPath}
                onChange={(e) => setRefAudioPath(e.target.value)}
                placeholder="C:\Users\...\my_voice_sample.wav hoặc để trống để dùng giọng chuẩn"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-500"
              />
              {refAudioPath && (
                <button
                  type="button"
                  onClick={() => setRefAudioPath('')}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg bg-slate-800"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Audio Result */}
        <div className="space-y-5">
          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Settings className="w-4 h-4 text-violet-400" />
              <span>Thiết Lập Tạo File Âm Thanh</span>
            </h3>

            {/* Quick Voice Overview Card */}
            <div
              onClick={() => setIsVoiceModalOpen(true)}
              className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-violet-500/50 cursor-pointer transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Giọng đọc đang chọn</span>
                <span className="text-[11px] text-violet-400 hover:underline">Đổi giọng</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-xs">
                  {currentVoice.initials || 'VN'}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>{currentVoice.name}</span>
                    {currentVoice.isStar && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {currentVoice.region} · {currentVoice.gender === 'female' ? 'Nữ' : 'Nam'}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Folder */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Dự án lưu trữ</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang tạo âm thanh...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Tạo File Giọng Đọc (Local)</span>
                </>
              )}
            </button>

            {/* Progress Bar – hiển thị khi đang tạo */}
            {isGenerating && (
              <div className="space-y-1.5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-violet-300 font-medium">
                    {progressDetail || 'Khởi tạo mô hình...'}
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progressPercent > 0 && progressPercent < 100 && (
                  <p className="text-[10px] text-slate-500 text-center">
                    Mỗi đoạn ~1-3s trên CPU · Văn bản dài hơn cần thêm thời gian
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Result & Playback Card */}
          {generatedAudioPath && (
            <div className="p-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Đã tạo xong file âm thanh
                </span>
                {lastDuration && (
                  <span className="text-[10px] text-slate-400">Thời gian tạo: {lastDuration}s</span>
                )}
              </div>

              {/* WAV file row */}
              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                <FileAudio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate flex-1">{generatedAudioPath.split(/[\\/]/).pop()}</span>
              </div>

              {/* SRT file row */}
              {generatedSrtPath && (
                <div className="flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-blue-800/30">
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate flex-1">{generatedSrtPath.split(/[\\/]/).pop()}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 font-bold uppercase shrink-0">SRT</span>
                </div>
              )}

              <audio
                ref={audioRef}
                src={`app-media://file?path=${encodeURIComponent(generatedAudioPath)}`}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handlePlayToggle}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Tạm dừng' : 'Nghe thử trực tiếp'}</span>
                </button>

                {generatedSrtPath && (
                  <button
                    onClick={handleOpenSrt}
                    className="p-2 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 transition-colors border border-blue-700/30"
                    title="Mở file phụ đề SRT"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={handleRevealInExplorer}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Mở thư mục chứa file"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Chọn Giọng Đọc (với nút Preview Nghe Thử) ──────────────────── */}
      {isVoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl max-h-[90vh] rounded-3xl border border-slate-800 bg-[#0d121f] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80">
              <div className="flex items-center gap-2.5 text-slate-200">
                <Mic className="w-5 h-5 text-violet-400" />
                <h2 className="text-base font-bold text-white">Chọn giọng đọc</h2>
              </div>
              <button
                onClick={() => {
                  if (previewAudioRef.current) previewAudioRef.current.pause();
                  setPlayingPreviewVoice(null);
                  setIsVoiceModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls Bar: Ngôn ngữ, Tốc độ, Xử lý */}
            <div className="px-6 py-3.5 bg-slate-900/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
              {/* Ngôn ngữ */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">NGÔN NGỮ</span>
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800">
                  <button
                    onClick={() => setSelectedLanguage('en')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedLanguage === 'en'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    us Tiếng Anh
                  </button>
                  <button
                    onClick={() => setSelectedLanguage('vi')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedLanguage === 'vi'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    vn Tiếng Việt
                  </button>
                </div>
              </div>

              {/* Tốc độ */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  TỐC ĐỘ <strong className="text-violet-400 font-bold">{speed.toFixed(1)}x</strong>
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-32 accent-violet-500 cursor-pointer"
                />
              </div>

              {/* Chế độ Xử lý: Auto, CPU, GPU */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">XỬ LÝ</span>
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800">
                  <button
                    onClick={() => setDeviceMode('auto')}
                    className={`px-2.5 py-1 rounded-lg font-medium ${deviceMode === 'auto' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => setDeviceMode('cpu')}
                    className={`px-2.5 py-1 rounded-lg font-medium ${deviceMode === 'cpu' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    CPU
                  </button>
                  <button
                    onClick={() => setDeviceMode('gpu')}
                    className={`px-2.5 py-1 rounded-lg font-medium ${deviceMode === 'gpu' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    GPU
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Bar: Tìm kiếm, Giới tính, Vùng miền */}
            <div className="px-6 py-3.5 space-y-3 border-b border-slate-800/80">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 w-full relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên giọng, vùng miền (Bắc/Trung/Nam), phong cách (tin tức, kể chuyện)..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800 shrink-0 text-xs">
                  <button
                    onClick={() => setGenderFilter('all')}
                    className={`px-3 py-1 rounded-lg ${genderFilter === 'all' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setGenderFilter('female')}
                    className={`px-3 py-1 rounded-lg ${genderFilter === 'female' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    ♀ Nữ
                  </button>
                  <button
                    onClick={() => setGenderFilter('male')}
                    className={`px-3 py-1 rounded-lg ${genderFilter === 'male' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    ♂ Nam
                  </button>
                </div>

                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {filteredVoices.length} giọng
                </span>
              </div>

              {/* Region and Star Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Vùng miền:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setRegionFilter('all')}
                      className={`px-3 py-1 rounded-xl border text-xs transition-all ${regionFilter === 'all'
                          ? 'border-violet-500 bg-violet-600/30 text-white font-bold'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                      Tất cả vùng
                    </button>
                    <button
                      onClick={() => setRegionFilter('Miền Bắc')}
                      className={`px-3 py-1 rounded-xl border text-xs transition-all ${regionFilter === 'Miền Bắc'
                          ? 'border-violet-500 bg-violet-600/30 text-white font-bold'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                      🏛 Miền Bắc
                    </button>
                    <button
                      onClick={() => setRegionFilter('Miền Trung')}
                      className={`px-3 py-1 rounded-xl border text-xs transition-all ${regionFilter === 'Miền Trung'
                          ? 'border-violet-500 bg-violet-600/30 text-white font-bold'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                      🏖 Miền Trung
                    </button>
                    <button
                      onClick={() => setRegionFilter('Miền Nam')}
                      className={`px-3 py-1 rounded-xl border text-xs transition-all ${regionFilter === 'Miền Nam'
                          ? 'border-violet-500 bg-violet-600/30 text-white font-bold'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                      🌴 Miền Nam
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOnlyStarFilter(!onlyStarFilter)}
                    className={`px-3 py-1 rounded-xl border text-xs transition-all flex items-center gap-1.5 ${onlyStarFilter
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-300 font-bold'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${onlyStarFilter ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                    <span>Chỉ giọng gốc</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddVoiceOpen(!isAddVoiceOpen)}
                    className="px-3 py-1 rounded-xl border border-violet-500/50 bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-semibold transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm giọng mới</span>
                  </button>
                </div>

                {/* Form thêm giọng đọc mới tùy chỉnh */}
                {isAddVoiceOpen && (
                  <form
                    onSubmit={handleAddCustomVoice}
                    className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-slate-900 to-indigo-950/30 border border-violet-500/40 space-y-3 animate-in fade-in duration-200 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-violet-300 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-violet-400" />
                        Tạo & Lưu Giọng Đọc Mới (Instant Voice Enrollment)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddVoiceOpen(false)}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-slate-400 text-[11px] font-medium">Tên giọng đọc</label>
                        <input
                          type="text"
                          value={newVoiceName}
                          onChange={(e) => setNewVoiceName(e.target.value)}
                          placeholder="VD: Bác Ba Phi, Chị Google..."
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-violet-500"
                          required
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <label className="text-slate-400 text-[11px] font-medium">Đường dẫn file ghi âm mẫu (.wav / 3-10 giây)</label>
                        <input
                          type="text"
                          value={newVoiceAudioPath}
                          onChange={(e) => setNewVoiceAudioPath(e.target.value)}
                          placeholder="C:\duong_dan\mau_giong_doc.wav"
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Giới tính:</span>
                          <select
                            value={newVoiceGender}
                            onChange={(e: any) => setNewVoiceGender(e.target.value)}
                            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
                          >
                            <option value="female">Nữ</option>
                            <option value="male">Nam</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Vùng miền:</span>
                          <select
                            value={newVoiceRegion}
                            onChange={(e: any) => setNewVoiceRegion(e.target.value)}
                            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
                          >
                            <option value="Miền Bắc">Miền Bắc</option>
                            <option value="Miền Trung">Miền Trung</option>
                            <option value="Miền Nam">Miền Nam</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Phong cách:</span>
                          <input
                            type="text"
                            value={newVoiceStyle}
                            onChange={(e) => setNewVoiceStyle(e.target.value)}
                            placeholder="Tự nhiên, Tin tức..."
                            className="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsAddVoiceOpen(false)}
                          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingVoice}
                          className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all shadow disabled:opacity-50"
                        >
                          {isSubmittingVoice ? 'Đang phân tích...' : 'Lưu Giọng Đọc'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}</div>
            </div>

            {/* Voices Grid */}
            <div className="flex-1 p-6 overflow-y-auto">
              {isLoadingVoices && voices.length === 0 ? (
                /* Skeleton Loading Grid (6-9 placeholders với hiệu ứng nhấp nháy mượt mà) */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex flex-col justify-between animate-pulse min-h-[148px]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0" />
                        <div className="space-y-2 flex-1 pt-1">
                          <div className="h-4 bg-slate-800 rounded w-3/4" />
                          <div className="h-3 bg-slate-800/60 rounded w-1/3" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 my-3">
                        <div className="h-5 bg-slate-800/80 rounded w-14" />
                        <div className="h-5 bg-slate-800/80 rounded w-16" />
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                        <div className="flex items-center gap-1.5">
                          <div className="h-4 bg-slate-800 rounded w-8" />
                          <div className="h-4 bg-slate-800 rounded w-10" />
                        </div>
                        <div className="w-7 h-7 rounded-full bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredVoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Mic className="w-10 h-10 mb-2 stroke-1 opacity-40 text-violet-400" />
                  <p className="text-sm font-medium">Không tìm thấy giọng đọc phù hợp với bộ lọc</p>
                  <button
                    onClick={() => { setSearchQuery(''); setGenderFilter('all'); setRegionFilter('all'); }}
                    className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVoices.map((v) => {
                    const isSelected = selectedVoiceId === v.id;
                    const isFemale = v.gender === 'female';
                    const isPreviewing = playingPreviewVoice === v.id;
                    const isLoadingPreview = previewLoadingVoice === v.id;

                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVoiceId(v.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${isSelected
                            ? 'border-violet-500 bg-violet-950/30 shadow-lg shadow-violet-600/10'
                            : 'border-slate-800/90 bg-slate-900/50 hover:border-slate-700'
                          }`}
                      >
                        {/* Top Row: Avatar, Name, Checked Pill */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-md ${getVoiceAvatarBg(v.name)}`}
                            >
                              {v.initials || 'VN'}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-white text-sm truncate">{v.name}</span>
                                {v.isStar && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium inline-block mt-0.5 ${getRegionBadge(v.region)}`}>
                                {v.region || 'Toàn quốc'}
                              </span>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md shrink-0">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>

                        {/* Middle: Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px]">
                          {v.tags && v.tags.length > 0 ? (
                            v.tags.map((t, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 font-normal">
                                {t}
                              </span>
                            ))
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                                Gốc
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                                Preset
                              </span>
                            </>
                          )}
                        </div>

                        {/* Bottom Row: Language & Gender pills, Play preview button & Select */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded font-bold uppercase bg-slate-800 text-slate-300">
                              {v.lang || 'VN'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-medium ${isFemale ? 'bg-pink-950/60 text-pink-400' : 'bg-blue-950/60 text-blue-400'
                                }`}
                            >
                              {isFemale ? 'Nữ' : 'Nam'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Audio Preview Button (Play/Stop sample) */}
                            <button
                              type="button"
                              onClick={(e) => handlePreviewVoice(e, v.id)}
                              disabled={isLoadingPreview}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isPreviewing
                                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                                }`}
                              title={isPreviewing ? 'Dừng nghe thử' : 'Nghe thử giọng này'}
                            >
                              {isLoadingPreview ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-violet-400" />
                              ) : isPreviewing ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5 ml-0.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVoiceId(v.id);
                                if (previewAudioRef.current) previewAudioRef.current.pause();
                                setPlayingPreviewVoice(null);
                                setIsVoiceModalOpen(false);
                              }}
                              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${isSelected
                                  ? 'bg-violet-600 text-white shadow-md'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                            >
                              {isSelected ? 'Đang chọn' : 'Chọn'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-900/40 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Đang chọn: <strong className="text-white">{currentVoice.name}</strong> ({currentVoice.region} ·{' '}
                {currentVoice.gender === 'female' ? 'Nữ' : 'Nam'})
              </span>
              <button
                type="button"
                onClick={() => {
                  if (previewAudioRef.current) previewAudioRef.current.pause();
                  setPlayingPreviewVoice(null);
                  setIsVoiceModalOpen(false);
                }}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30 transition-all"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
