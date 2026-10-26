import React, { useState, useCallback, useRef } from 'react';
import { useQueueStore } from '../store/queue-store.ts';
import { useAppStore } from '../store/app-store.ts';
import {
  Wand2,
  FileText,
  User,
  Palette,
  ChevronRight,
  Copy,
  CheckCheck,
  Send,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ListOrdered,
  Download,
  Settings,
  Bot,
  Check,
} from 'lucide-react';

// ─── SRT Parser ────────────────────────────────────────────────────────────────

interface SrtBlock {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

function parseSrt(raw: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const cleaned = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const parts = cleaned.split(/\n{2,}/);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    if (lines.length < 3) continue;

    const indexLine = lines[0].trim();
    const timeLine = lines[1].trim();
    const textLines = lines.slice(2);

    const index = parseInt(indexLine);
    if (isNaN(index)) continue;

    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
    );
    if (!timeMatch) continue;

    // Strip HTML tags from subtitles
    const text = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!text) continue;

    blocks.push({
      index,
      startTime: timeMatch[1],
      endTime: timeMatch[2],
      text,
    });
  }

  return blocks;
}

import {
  generatePromptWithFailover,
  getAvailableAiProviders,
  GeneratePromptResult,
  checkAllAiQuotas,
  AiQuotaInfo,
  getAiUsageToday,
} from '../services/ai-prompt-service';

// ─── Component ─────────────────────────────────────────────────────────────────

interface GeneratedPrompt {
  index: number;
  srtText: string;
  prompt: string;
  edited: boolean;
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export const PromptGenView: React.FC = () => {
  const { createBatchJobs } = useQueueStore();
  const { settings, addNotification, setActiveTab } = useAppStore();

  // ── Inputs
  const [srtText, setSrtText] = useState('');
  const [fixedCharacter, setFixedCharacter] = useState('');
  const [fixedStyle, setFixedStyle] = useState('');

  // ── State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Queue settings for sending
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastGenResult, setLastGenResult] = useState<GeneratePromptResult | null>(null);

  // Quota & Usage
  const [quotas, setQuotas] = useState<AiQuotaInfo[] | null>(null);
  const [isCheckingQuotas, setIsCheckingQuotas] = useState(false);

  const abortRef = useRef(false);

  const availableProviders = getAvailableAiProviders(settings);
  const configuredProviders = availableProviders.filter((p) => p.hasKey);

  const handleCheckQuotas = async () => {
    if (configuredProviders.length === 0) return;
    setIsCheckingQuotas(true);
    try {
      const q = await checkAllAiQuotas(settings);
      setQuotas(q);
    } catch {
      // Ignore
    } finally {
      setIsCheckingQuotas(false);
    }
  };

  const buildSystemPrompt = useCallback(() => {
    const char = fixedCharacter.trim() || '[NHÂN VẬT CỐ ĐỊNH]';
    const style = fixedStyle.trim() || '[STYLE CỐ ĐỊNH]';

    return `Bạn là chuyên gia tạo image prompt từ phụ đề SRT. Nhiệm vụ:

Quy tắc BẮT BUỘC:
- 1 block SRT = 1 prompt ảnh.
- Giữ đúng số thứ tự block, không gộp, không bỏ, không thêm block mới.
- Prompt viết bằng tiếng Anh.
- Mỗi prompt chuyển nội dung SRT thành một cảnh hình ảnh cụ thể.
- Không dịch nguyên văn câu thoại — tập trung vào: nhân vật, hành động, cảm xúc, bối cảnh, không khí.
- Nếu block nói ý trừu tượng, biến thành hình ảnh biểu tượng dễ hiểu.
- Không dùng chữ, số, logo, huy hiệu, quốc huy, cờ, watermark trong ảnh.
- Nếu có người thật/nhân vật nổi tiếng, dùng mô tả an toàn như "fictional character inspired by the story".
- Nếu block có xuất hiện nhân vật chính (người kể chuyện/"bạn" trong SRT), BẮT BUỘC chèn nguyên văn NHÂN VẬT CỐ ĐỊNH vào ngay sau mô tả cảnh — không diễn giải lại.
- Cuối EVERY prompt phải có đúng STYLE CỐ ĐỊNH.
- Không sửa, rút gọn hay thay đổi STYLE CỐ ĐỊNH hoặc NHÂN VẬT CỐ ĐỊNH.

NHÂN VẬT CỐ ĐỊNH: ${char}
STYLE CỐ ĐỊNH: ${style}

Output FORMAT (chỉ danh sách, không thêm chú thích):
1. [scene description], ${char !== '[NHÂN VẬT CỐ ĐỊNH]' ? char : '[NHÂN VẬT CỐ ĐỊNH nếu có nhân vật chính]'}, ${style}
2. [scene description], [optional: NHÂN VẬT CỐ ĐỊNH], ${style}
... (tiếp tục đến hết)`;
  }, [fixedCharacter, fixedStyle]);

  const handleGenerate = async () => {
    setError(null);
    setStatusMessage(null);

    if (configuredProviders.length === 0) {
      setError(
        'Chưa cấu hình API Key nào (Gemini, ChatGPT hoặc Claude). Vui lòng vào Cài đặt để thêm key.'
      );
      return;
    }
    if (!srtText.trim()) {
      setError('Vui lòng dán nội dung SRT vào ô bên trái.');
      return;
    }

    const blocks = parseSrt(srtText);
    if (blocks.length === 0) {
      setError('Không tìm thấy block SRT hợp lệ. Hãy kiểm tra định dạng file SRT.');
      return;
    }

    setIsGenerating(true);
    abortRef.current = false;
    setGeneratedPrompts([]);
    setSelectedIndices(new Set());
    setProgress({ done: 0, total: blocks.length });

    try {
      const systemPrompt = buildSystemPrompt();

      // Send all blocks at once for efficiency
      const srtContent = blocks
        .map((b) => `${b.index}\n${b.startTime} --> ${b.endTime}\n${b.text}`)
        .join('\n\n');

      const result = await generatePromptWithFailover({
        systemPrompt,
        userContent: `SRT:\n${srtContent}`,
        settings,
        onStatusUpdate: (status) => {
          setStatusMessage(status.message);
          if (status.isWarning) {
            addNotification({
              type: 'warning',
              message: status.message,
            });
          }
        },
      });

      if (abortRef.current) return;
      setLastGenResult(result);

      // Parse response lines
      const lines = result.text.trim().split('\n');
      const parsed: GeneratedPrompt[] = [];

      let blockIdx = 0;
      for (const line of lines) {
        // Hỗ trợ parse định dạng: "1. Prompt", "1 - Prompt", "1: Prompt", "[1] Prompt"
        const match = line.match(/^(?:\[?(\d+)\]?[\.\:\-]?\s+)(.+)$/);
        if (match) {
          const num = parseInt(match[1]);
          const promptText = match[2].trim();
          const originalBlock = blocks.find((b) => b.index === num) || blocks[blockIdx];
          parsed.push({
            index: num,
            srtText: originalBlock?.text || '',
            prompt: promptText,
            edited: false,
          });
          blockIdx++;
        }
      }

      if (parsed.length === 0) {
        throw new Error(
          `Không trích xuất được danh sách prompt từ kết quả của ${result.providerName}. Vui lòng thử lại.`
        );
      }

      setGeneratedPrompts(parsed);
      setSelectedIndices(new Set(parsed.map((p) => p.index)));
      setProgress({ done: parsed.length, total: blocks.length });

      const fallbackNote =
        result.fallbackCount > 0
          ? ` (đã tự động chuyển đổi từ ${result.attempts.filter((a) => !a.success).map((a) => a.name).join(', ')} do lỗi/hết quota)`
          : '';

      addNotification({
        type: 'success',
        message: `Đã tạo ${parsed.length} image prompt từ SRT qua ${result.providerName}${fallbackNote}!`,
      });
    } catch (err: any) {
      setError(err.message || 'Lỗi không xác định khi gọi AI API.');
    } finally {
      setIsGenerating(false);
      setStatusMessage(null);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setIsGenerating(false);
  };

  const handleEditPrompt = (index: number, value: string) => {
    setGeneratedPrompts((prev) =>
      prev.map((p) => (p.index === index ? { ...p, prompt: value, edited: true } : p))
    );
  };

  const handleCopy = async (index: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = async () => {
    const all = generatedPrompts
      .filter((p) => selectedIndices.has(p.index))
      .map((p) => p.prompt)
      .join('\n');
    await navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportTxt = () => {
    const content = generatedPrompts
      .filter((p) => selectedIndices.has(p.index))
      .map((p) => p.prompt)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompts-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToQueue = async () => {
    const selected = generatedPrompts.filter((p) => selectedIndices.has(p.index));
    if (selected.length === 0) {
      addNotification({ type: 'warning', message: 'Chưa chọn prompt nào để gửi vào queue.' });
      return;
    }

    const inputs = selected.map((p, i) => ({
      type: 'image' as const,
      name: `Prompt-SRT-${p.index}`,
      prompt: p.prompt,
      aspectRatio,
      metadata: { batchId: `srt_batch_${Date.now()}`, srtIndex: p.index },
    }));

    await createBatchJobs(inputs);
    addNotification({
      type: 'success',
      message: `Đã thêm ${inputs.length} prompt vào hàng đợi tạo ảnh!`,
    });
    setActiveTab('queue');
  };

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedIndices(new Set(generatedPrompts.map((p) => p.index)));
  const deselectAll = () => setSelectedIndices(new Set());

  const hasResults = generatedPrompts.length > 0;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Panel: Inputs ── */}
      <div className="w-[500px] shrink-0 flex flex-col border-r border-slate-800 bg-[#0d1322] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-violet-600/30">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Tạo Prompt từ SRT</h2>
              <p className="text-[11px] text-slate-400">Dùng Gemini AI để chuyển phụ đề thành image prompts</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
          {/* AI Providers Status Banner */}
          {configuredProviders.length === 0 ? (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-300 font-semibold">Chưa cấu hình API Key AI</p>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  Vào{' '}
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="underline hover:text-amber-200 font-bold"
                  >
                    Cài đặt
                  </button>
                  {' '}để thêm ít nhất một API Key (Gemini, ChatGPT hoặc Claude).
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  AI Providers & Quota ({configuredProviders.length}/3 sẵn sàng)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCheckQuotas}
                    disabled={isCheckingQuotas}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingQuotas ? 'animate-spin' : ''}`} />
                    <span>{isCheckingQuotas ? 'Đang check...' : 'Kiểm tra Quota'}</span>
                  </button>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 hover:underline"
                  >
                    <Settings className="w-3 h-3" />
                    Cài đặt
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {availableProviders.map((p) => {
                  const qInfo = quotas?.find((q) => q.provider === p.id);
                  const usage = getAiUsageToday()[p.id];
                  const isOutOfQuota = qInfo?.status === 'out_of_quota';
                  const isInvalid = qInfo?.status === 'invalid_key';

                  return (
                    <div
                      key={p.id}
                      className={`p-2 rounded-lg border text-[11px] flex flex-col justify-between space-y-1 ${!p.hasKey
                          ? 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                          : isOutOfQuota
                            ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                            : isInvalid
                              ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                              : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold truncate text-[11px] text-slate-200">
                          {p.name.replace(/\(.*?\)/g, '').trim()}
                        </span>
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${!p.hasKey
                              ? 'bg-slate-600'
                              : isOutOfQuota
                                ? 'bg-rose-400'
                                : isInvalid
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                            }`}
                        />
                      </div>

                      <div className="text-[10px] text-slate-400 space-y-0.5">
                        <div className="flex justify-between">
                          <span>Quota:</span>
                          <span className="font-medium text-slate-300">
                            {p.id === 'gemini'
                              ? '1,500/ngày'
                              : p.id === 'openai'
                                ? (qInfo?.remainingRequests ? `${qInfo.remainingRequests} RPM` : 'Payg')
                                : (qInfo?.remainingRequests ? `${qInfo.remainingRequests}` : 'Credits')}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Dùng hôm nay:</span>
                          <span className="text-violet-400 font-semibold">{usage} lượt</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 text-violet-400" />
                  Tự động chuyển đổi khi hết quota / lỗi
                </span>
                {settings?.preferredAiProvider && (
                  <span className="text-slate-500">
                    Ưu tiên: <strong className="text-slate-300 capitalize">{settings.preferredAiProvider}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* SRT Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              Nội dung SRT
            </label>
            <textarea
              value={srtText}
              onChange={(e) => setSrtText(e.target.value)}
              rows={10}
              placeholder={`1\n00:00:01,000 --> 00:00:03,000\nBạn từng nghĩ rằng cuộc đời sẽ dễ dàng hơn...\n\n2\n00:00:03,500 --> 00:00:06,000\nNhưng thực tế lại khác xa những gì bạn tưởng tượng.`}
              className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none leading-relaxed transition-colors"
            />
            {srtText && (
              <p className="text-[10px] text-slate-500">
                Phát hiện ~{parseSrt(srtText).length} blocks SRT
              </p>
            )}
          </div>

          {/* Fixed Character */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Nhân vật cố định
              <span className="text-[10px] text-slate-500 font-normal">(tuỳ chọn)</span>
            </label>
            <textarea
              value={fixedCharacter}
              onChange={(e) => setFixedCharacter(e.target.value)}
              rows={3}
              placeholder="Ví dụ: A Vietnamese man in his 30s, wearing a white linen shirt, short black hair, warm confident smile, standing in soft natural light..."
              className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed transition-colors"
            />
            <p className="text-[10px] text-slate-500">
              Đoạn mô tả này sẽ được chèn vào prompt khi block SRT có nhân vật chính xuất hiện.
            </p>
          </div>

          {/* Fixed Style */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              Style cố định
              <span className="text-[10px] text-slate-500 font-normal">(tuỳ chọn)</span>
            </label>
            <textarea
              value={fixedStyle}
              onChange={(e) => setFixedStyle(e.target.value)}
              rows={3}
              placeholder="Ví dụ: cinematic photography, shot on Sony A7IV, 85mm f/1.8, soft warm tones, film grain, ultra detailed, 8k resolution, professional color grading..."
              className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none leading-relaxed transition-colors"
            />
            <p className="text-[10px] text-slate-500">
              Style này sẽ được thêm vào cuối mỗi prompt.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300 leading-relaxed whitespace-pre-line">{error}</p>
            </div>
          )}

          {/* Real-time Status / Failover Message */}
          {isGenerating && statusMessage && (
            <div className="p-3 rounded-xl bg-violet-950/50 border border-violet-800/60 flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />
              <span className="text-xs text-violet-200 leading-relaxed font-medium">{statusMessage}</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={isGenerating ? handleStop : handleGenerate}
            className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${isGenerating
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-600/30'
              }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang tạo...{progress && ` (${progress.done}/${progress.total})`}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Tạo Prompt từ SRT
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Right Panel: Results ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#090d16]">
        {/* Toolbar */}
        {hasResults && (
          <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-4 bg-[#0d1322]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-violet-400" />
                {generatedPrompts.length} prompts
              </span>

              {lastGenResult && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px]">
                  <span className="text-slate-500">Nguồn:</span>
                  <span className="text-slate-200 font-semibold">{lastGenResult.providerName}</span>
                  {lastGenResult.fallbackCount > 0 && (
                    <span className="px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-medium">
                      Fallback
                    </span>
                  )}
                </div>
              )}

              <span className="text-slate-700">|</span>
              <button onClick={selectAll} className="text-[11px] text-violet-400 hover:text-violet-300">
                Chọn tất cả
              </button>
              <button onClick={deselectAll} className="text-[11px] text-slate-500 hover:text-slate-300">
                Bỏ chọn tất cả
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Aspect Ratio for Queue */}
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
              >
                {copiedAll ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy {selectedIndices.size} prompt
              </button>

              <button
                onClick={handleExportTxt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất .txt
              </button>

              <button
                onClick={handleSendToQueue}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-xs font-bold text-white shadow shadow-violet-600/30 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                Gửi {selectedIndices.size} vào Queue
              </button>
            </div>
          </div>
        )}

        {/* Prompt List */}
        <div className="flex-1 overflow-y-auto p-6">
          {!hasResults && !isGenerating && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-700/20 border border-violet-500/20 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-300">Chưa có prompt nào</h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
                  Dán nội dung SRT, điền nhân vật và style cố định, sau đó nhấn <strong className="text-violet-400">Tạo Prompt từ SRT</strong>
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <ChevronRight className="w-3.5 h-3.5" />
                <span>Kết quả sẽ hiển thị ở đây và có thể chỉnh sửa từng prompt</span>
              </div>
            </div>
          )}

          {isGenerating && generatedPrompts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-violet-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-300">Gemini đang phân tích SRT...</h3>
                <p className="text-xs text-slate-500 mt-1">Quá trình này thường mất 5–20 giây.</p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {hasResults && (
            <div className="space-y-3">
              {generatedPrompts.map((item) => {
                const isSelected = selectedIndices.has(item.index);
                return (
                  <div
                    key={item.index}
                    className={`rounded-xl border transition-all ${isSelected
                        ? 'border-violet-500/40 bg-violet-950/20'
                        : 'border-slate-800 bg-[#0d1322] opacity-60'
                      }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.index)}
                        className="mt-0.5 w-4 h-4 accent-violet-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-violet-400">Block #{item.index}</span>
                          {item.edited && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Đã sửa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate italic">
                          "{item.srtText}"
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopy(item.index, item.prompt)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Copy prompt này"
                      >
                        {copiedIndex === item.index ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Editable Prompt */}
                    <div className="px-4 py-3">
                      <textarea
                        value={item.prompt}
                        onChange={(e) => handleEditPrompt(item.index, e.target.value)}
                        rows={3}
                        className="w-full bg-transparent text-xs text-slate-200 leading-relaxed resize-none focus:outline-none placeholder-slate-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
