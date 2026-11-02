import React, { useState, useEffect, useMemo } from 'react';
import {
  Film,
  Music,
  FileText,
  Image as ImageIcon,
  FolderOpen,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Play,
  ExternalLink,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { CapCutDetectResult, CapCutDraftResult } from '../../shared/types.ts';

export interface CapCutExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDraftName?: string;
  initialSrtText?: string;
  initialSrtPath?: string;
  initialAudioPath?: string;
  initialMediaPaths?: string[];
  initialMediaFolder?: string;
}

interface ParsedCue {
  index: number;
  timecode: string;
  startMs: number;
  durationMs: number;
  text: string;
}

export const CapCutExportModal: React.FC<CapCutExportModalProps> = ({
  isOpen,
  onClose,
  initialDraftName,
  initialSrtText,
  initialSrtPath,
  initialAudioPath,
  initialMediaPaths,
  initialMediaFolder,
}) => {
  const [capcutInfo, setCapcutInfo] = useState<CapCutDetectResult | null>(null);
  const [draftName, setDraftName] = useState(initialDraftName || 'FlowStudio_Video_01');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [audioPath, setAudioPath] = useState(initialAudioPath || '');
  const [srtText, setSrtText] = useState(initialSrtText || '');
  const [srtPath, setSrtPath] = useState(initialSrtPath || '');
  const [mediaPaths, setMediaPaths] = useState<string[]>(initialMediaPaths || []);
  const [mediaFolder, setMediaFolder] = useState(initialMediaFolder || '');
  const [openAfterExport, setOpenAfterExport] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<CapCutDraftResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detect CapCut on open
  useEffect(() => {
    if (isOpen && window.api) {
      window.api.capcutDetect().then((res) => {
        setCapcutInfo(res);
      });
      setResult(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Sync initial props when opened
  useEffect(() => {
    if (initialDraftName) setDraftName(initialDraftName);
    if (initialSrtText) setSrtText(initialSrtText);
    if (initialSrtPath) setSrtPath(initialSrtPath);
    if (initialAudioPath) setAudioPath(initialAudioPath);
    if (initialMediaPaths && initialMediaPaths.length > 0) setMediaPaths(initialMediaPaths);
    if (initialMediaFolder) setMediaFolder(initialMediaFolder);
  }, [initialDraftName, initialSrtText, initialSrtPath, initialAudioPath, initialMediaPaths, initialMediaFolder]);

  // Live parse SRT cues for preview
  const parsedCues = useMemo<ParsedCue[]>(() => {
    if (!srtText.trim()) return [];
    const cues: ParsedCue[] = [];
    const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      let timeIndex = 0;
      let rawIndex = 1;
      if (/^\d+$/.test(lines[0].trim())) {
        rawIndex = parseInt(lines[0].trim(), 10);
        timeIndex = 1;
      }

      const timeLine = lines[timeIndex];
      if (!timeLine || !timeLine.includes('-->')) continue;

      const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim());
      const parseMs = (tc: string) => {
        const m = tc.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
        if (!m) return 0;
        return parseInt(m[1], 10) * 3600000 + parseInt(m[2], 10) * 60000 + parseInt(m[3], 10) * 1000 + parseInt(m[4].padEnd(3, '0').slice(0, 3), 10);
      };

      const startMs = parseMs(startStr);
      const endMs = parseMs(endStr);
      const durationMs = Math.max(100, endMs - startMs);
      const text = lines.slice(timeIndex + 1).join(' ').trim();

      cues.push({
        index: rawIndex,
        timecode: timeLine,
        startMs,
        durationMs,
        text,
      });
    }

    return cues;
  }, [srtText]);

  // Handlers for file selection
  const handleSelectAudio = async () => {
    if (!window.api) return;
    const res = await window.api.selectAudioFile();
    if (res?.filePath) {
      setAudioPath(res.filePath);
    }
  };

  const handleSelectSrt = async () => {
    if (!window.api) return;
    const res = await window.api.capcutSelectSrtFile();
    if (res) {
      setSrtPath(res.filePath);
      setSrtText(res.content);
    }
  };

  const handleSelectMediaFolder = async () => {
    if (!window.api) return;
    const folder = await window.api.selectFolder();
    if (folder) {
      setMediaFolder(folder);
      setMediaPaths([]);
    }
  };

  const handleExecuteExport = async () => {
    if (!window.api) return;
    if (!srtText.trim() && !srtPath) {
      setErrorMsg('Vui lòng chọn hoặc dán phụ đề SRT.');
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);

    try {
      const res = await window.api.capcutCreateDraft({
        draftName: draftName.trim() || 'FlowStudio_Video',
        audioPath,
        srtContent: srtText,
        srtPath,
        mediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
        mediaFolder: mediaFolder || undefined,
        aspectRatio,
        copyMediaToDraft: true,
        openCapCut: openAfterExport,
      });

      if (res.success) {
        setResult(res);
      } else {
        setErrorMsg(res.message || res.error || 'Có lỗi xảy ra khi tạo bản nháp.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi không xác định khi tạo bản nháp CapCut.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[92vh] rounded-3xl border border-[#E2E6FF] bg-white shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#E2E6FF] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#5F2CFF] to-[#7B52FF] flex items-center justify-center shadow-md shadow-[#5F2CFF]/20 text-white">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1A0A4A]">Tạo Bản Nháp CapCut Tự Động</h3>
                {capcutInfo?.installed ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    CapCut PC Sẵn sàng
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Chưa phát hiện CapCut PC
                  </span>
                )}
              </div>
              <p className="text-xs text-[#4A4070]">
                Tự động ghép Voice, Ảnh và Phụ đề SRT khớp chuẩn từng khung hình, mở CapCut lên là có sẵn
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8B85B8] hover:text-[#1A0A4A] hover:bg-[#F0F3FF] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {!result ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F4F6FF]">
            {/* Top Row: Draft Name & Aspect Ratio */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#5F2CFF]" />
                  Tên dự án bản nháp
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="VD: Video_KichBan_01..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] text-xs font-semibold text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF] shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1A0A4A]">Tỉ lệ khung hình</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white border border-[#E2E6FF] shadow-sm">
                  {(['16:9', '9:16', '1:1'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAspectRatio(r)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                        aspectRatio === r
                          ? 'bg-[#5F2CFF] text-white shadow-sm'
                          : 'text-[#4A4070] hover:text-[#1A0A4A] hover:bg-[#F0F3FF]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Input 1: Voice Audio */}
            <div className="p-4 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-[#5F2CFF]" />
                  <span>1. File âm thanh giọng đọc (Voice Audio)</span>
                </label>
                <span className="text-[11px] text-[#8B85B8]">Hỗ trợ .wav, .mp3, .m4a</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={audioPath}
                  onChange={(e) => setAudioPath(e.target.value)}
                  placeholder="Chọn file âm thanh hoặc tự động điền từ vừa tạo TTS..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#F4F6FF]/70 border border-[#E2E6FF] text-xs text-[#1A0A4A] font-mono focus:outline-none focus:border-[#5F2CFF]"
                />
                <button
                  type="button"
                  onClick={handleSelectAudio}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#5F2CFF] border border-[#C4CEFF] transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Chọn file</span>
                </button>
              </div>
            </div>

            {/* Input 2: SRT Subtitles */}
            <div className="p-4 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>2. Phụ đề SRT (Quyết định thời lượng từng khung hình)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#5F2CFF]">
                    {parsedCues.length} câu phụ đề
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectSrt}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-white hover:bg-[#F0F3FF] text-[#4A4070] border border-[#E2E6FF] transition-all flex items-center gap-1 shadow-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#5F2CFF]" />
                    <span>Nạp file .srt</span>
                  </button>
                </div>
              </div>

              <textarea
                value={srtText}
                onChange={(e) => setSrtText(e.target.value)}
                rows={4}
                placeholder="Dán nội dung SRT hoặc nạp file .srt vào đây..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F6FF]/70 border border-[#E2E6FF] text-xs font-mono text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF] resize-none leading-relaxed"
              />
            </div>

            {/* Input 3: Images / Videos List */}
            <div className="p-4 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[#7B52FF]" />
                  <span>3. Hình ảnh / Video minh họa (Khớp theo thứ tự SRT)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#7B52FF]">
                    {mediaPaths.length > 0 ? `${mediaPaths.length} file được chọn` : mediaFolder ? 'Chọn theo thư mục' : 'Chưa có file'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectMediaFolder}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#5F2CFF] border border-[#C4CEFF] transition-all flex items-center gap-1 shadow-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Chọn thư mục ảnh</span>
                  </button>
                </div>
              </div>

              {mediaFolder && (
                <div className="p-2.5 rounded-xl bg-[#F0F3FF] border border-[#C4CEFF] text-xs text-[#4A4070] flex items-center gap-2 font-mono">
                  <FolderOpen className="w-4 h-4 text-[#5F2CFF] shrink-0" />
                  <span className="truncate">{mediaFolder}</span>
                </div>
              )}

              {mediaPaths.length > 0 && (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 rounded-xl bg-[#F4F6FF]/70 border border-[#E2E6FF]">
                  {mediaPaths.map((mp, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E6FF] text-[11px] font-mono text-[#4A4070] flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="w-4 h-4 rounded-full bg-[#5F2CFF] text-white flex items-center justify-center text-[9px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="max-w-[120px] truncate">{mp.split(/[\\/]/).pop()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timeline Alignment Preview */}
            {parsedCues.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#5F2CFF]" />
                    Xem trước phân cảnh tự động (Timeline Mapping Preview)
                  </label>
                  <span className="text-[11px] text-[#8B85B8]">
                    {parsedCues.length} phân cảnh được tạo
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#E2E6FF] bg-white divide-y divide-[#E2E6FF] shadow-sm">
                  {parsedCues.slice(0, 15).map((cue, idx) => {
                    const mappedImg = mediaPaths.length > 0
                      ? mediaPaths[Math.min(idx, mediaPaths.length - 1)].split(/[\\/]/).pop()
                      : mediaFolder
                      ? `Ảnh ${idx + 1}`
                      : '(Chưa chọn ảnh)';

                    return (
                      <div key={idx} className="p-2.5 px-4 flex items-center justify-between gap-4 text-xs hover:bg-[#F0F3FF]/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-[#F0F3FF] text-[#5F2CFF] font-bold flex items-center justify-center text-[11px] shrink-0">
                            {cue.index}
                          </span>
                          <span className="font-mono text-[10px] text-[#8B85B8] shrink-0">
                            {(cue.startMs / 1000).toFixed(1)}s ({(cue.durationMs / 1000).toFixed(1)}s)
                          </span>
                          <span className="text-[#1A0A4A] truncate font-medium">{cue.text}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#5F2CFF] shrink-0 bg-[#F0F3FF] px-2 py-0.5 rounded-md border border-[#C4CEFF]">
                          <ImageIcon className="w-3 h-3" />
                          <span className="max-w-[140px] truncate">{mappedImg}</span>
                        </div>
                      </div>
                    );
                  })}
                  {parsedCues.length > 15 && (
                    <div className="p-2 text-center text-[11px] text-[#8B85B8] bg-[#F4F6FF]">
                      ... và {parsedCues.length - 15} câu phụ đề tiếp theo
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error banner */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        ) : (
          /* Success Screen */
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-5 bg-[#F4F6FF]">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5 max-w-md">
              <h3 className="text-lg font-bold text-[#1A0A4A]">Tạo Bản Nháp CapCut Thành Công!</h3>
              <p className="text-xs text-[#4A4070] leading-relaxed">{result.message}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E6FF] shadow-sm text-xs font-mono text-left space-y-1.5 w-full max-w-md">
              <div className="flex justify-between">
                <span className="text-[#8B85B8]">Tên dự án:</span>
                <strong className="text-[#1A0A4A]">{result.draftName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B85B8]">Phụ đề:</span>
                <span className="text-emerald-700 font-bold">{result.cueCount} câu</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B85B8]">Hình ảnh:</span>
                <span className="text-[#5F2CFF] font-bold">{result.mediaCount} ảnh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B85B8]">Thời lượng:</span>
                <span className="text-[#1A0A4A]">{result.totalDurationSec} giây</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.api?.capcutLaunch()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md shadow-[#5F2CFF]/20 flex items-center gap-2 transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Mở CapCut ngay</span>
              </button>

              <button
                type="button"
                onClick={() => window.api?.capcutOpenDraftFolder(result.draftPath)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-[#F0F3FF] text-[#4A4070] border border-[#E2E6FF] flex items-center gap-2 transition-all shadow-sm"
              >
                <FolderOpen className="w-4 h-4 text-[#5F2CFF]" />
                <span>Mở thư mục Draft</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#8B85B8] hover:text-[#1A0A4A]"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Footer Toolbar */}
        {!result && (
          <div className="px-6 py-4 bg-white border-t border-[#E2E6FF] flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-[#4A4070]">
              <input
                type="checkbox"
                checked={openAfterExport}
                onChange={(e) => setOpenAfterExport(e.target.checked)}
                className="w-4 h-4 rounded text-[#5F2CFF] focus:ring-[#5F2CFF] accent-[#5F2CFF]"
              />
              <span>Tự động mở CapCut sau khi tạo xong</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4A4070] hover:text-[#1A0A4A]"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleExecuteExport}
                disabled={isExporting || parsedCues.length === 0}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md shadow-[#5F2CFF]/20 flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang tạo bản nháp CapCut...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo Bản Nháp CapCut</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

