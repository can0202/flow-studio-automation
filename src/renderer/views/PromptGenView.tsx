import React, { useState, useRef } from 'react';
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
  ToggleLeft,
  ToggleRight,
  FlaskConical,
  RotateCw,
  RotateCcw,
  Play,
} from 'lucide-react';

// ─── SRT Parser ────────────────────────────────────────────────────────────────

interface SrtBlock {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

function parseSubtitles(raw: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const cleaned = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return blocks;

  const timeRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,\.](\d{1,3}))?\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,\.](\d{1,3}))?/;

  const lines = cleaned.split('\n');
  const hasTimecodes = lines.some((l) => timeRegex.test(l));

  if (!hasTimecodes) {
    const textLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    textLines.forEach((t, idx) => {
      const cleanText = t.replace(/^(\d+[\.\:\-\)]|\(\d+\))\s*/, '').trim();
      if (cleanText) {
        blocks.push({
          index: idx + 1,
          startTime: '',
          endTime: '',
          text: cleanText,
        });
      }
    });
    return blocks;
  }

  let currentIndex = 0;
  let currentStart = '';
  let currentEnd = '';
  let currentTextLines: string[] = [];

  function flush() {
    if (currentTextLines.length > 0 || currentStart) {
      const text = currentTextLines.join(' ').replace(/<[^>]+>/g, '').trim();
      if (text) {
        currentIndex++;
        blocks.push({
          index: currentIndex,
          startTime: currentStart,
          endTime: currentEnd,
          text,
        });
      }
    }
    currentTextLines = [];
    currentStart = '';
    currentEnd = '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }

    const m = line.match(timeRegex);
    if (m) {
      // If the preceding line in text buffer was just a numeric index (e.g. "1", "2"), remove it
      if (currentTextLines.length > 0 && /^\d+$/.test(currentTextLines[currentTextLines.length - 1])) {
        currentTextLines.pop();
      }
      flush();
      const parts = m[0].split('-->');
      currentStart = parts[0]?.trim() || '';
      currentEnd = parts[1]?.trim() || '';
      continue;
    }

    if (currentStart) {
      currentTextLines.push(line);
    }
  }
  flush();

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
  const [groupingSize, setGroupingSize] = useState<number>(1);

  // ── Custom Formula
  const [useCustomFormula, setUseCustomFormula] = useState(false);
  const DEFAULT_FORMULA = `Tạo ĐÚNG {COUNT} image prompts từ SRT dưới đây.
Yêu cầu bắt buộc:
- 1 block SRT = 1 prompt ảnh.
- Giữ nguyên số thứ tự block.
- Không gộp block.
- Không bỏ block.
- Không tự thêm block mới.
- Prompt viết bằng tiếng Anh.
- Mỗi prompt phải chuyển nội dung của block SRT thành một cảnh hình ảnh cụ thể.
- Không dịch nguyên văn câu thoại.
- Tập trung vào: nhân vật, hành động, cảm xúc, bối cảnh, không khí của block.
- Nếu block nói về ý trừu tượng, hãy biến thành hình ảnh biểu tượng dễ hiểu.
- Nếu có người thật hoặc nhân vật nổi tiếng, không tạo giống mặt thật; dùng mô tả an toàn như "fictional character inspired by the story".
- Không dùng chữ, số, logo, huy hiệu, quốc huy, cờ hoặc watermark trong ảnh.
- Nếu block có xuất hiện nhân vật chính (người kể chuyện/"bạn" trong SRT), BẮT BUỘC phải chèn nguyên văn NHÂN VẬT CỐ ĐỊNH vào ngay sau mô tả cảnh — không được diễn giải lại, rút gọn, tóm tắt hay tự mô tả nhân vật theo cách khác. Nếu block không có nhân vật chính xuất hiện (ví dụ chỉ tả cảnh vật, đồ vật, hoặc nhân vật phụ khác), bỏ qua bước chèn NHÂN VẬT CỐ ĐỊNH ở block đó.
- Cuối mỗi prompt phải thêm đúng phần STYLE CỐ ĐỊNH.
- Không tự sửa, rút gọn hoặc thay đổi STYLE CỐ ĐỊNH hoặc NHÂN VẬT CỐ ĐỊNH.
- Nếu STYLE CỐ ĐỊNH hoặc NHÂN VẬT CỐ ĐỊNH đang để trống, vẫn tạo prompt bình thường và để đúng vị trí tương ứng ghi: [STYLE CỐ ĐỊNH] và [NHÂN VẬT CỐ ĐỊNH].

NHÂN VẬT CỐ ĐỊNH:
{CHARACTER}

STYLE CỐ ĐỊNH:
{STYLE}

Output chỉ gồm danh sách prompt theo mẫu:
{START}. [image prompt based on SRT block {START}], [NHÂN VẬT CỐ ĐỊNH nếu có nhân vật chính trong block], [STYLE CỐ ĐỊNH]
...
{END}. [image prompt based on SRT block {END}], [NHÂN VẬT CỐ ĐỊNH nếu có nhân vật chính trong block], [STYLE CỐ ĐỊNH]`;
  const [customFormula, setCustomFormula] = useState(DEFAULT_FORMULA);

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

  const detectedBlocks = React.useMemo(() => parseSubtitles(srtText), [srtText]);

  // Apply grouping if selected (e.g. 1:1, or 2 blocks per scene, 3 blocks per scene)
  const blocks = React.useMemo<SrtBlock[]>(() => {
    if (detectedBlocks.length === 0) return [];
    if (groupingSize <= 1) return detectedBlocks;
    const grouped: SrtBlock[] = [];
    let sceneIdx = 1;
    for (let i = 0; i < detectedBlocks.length; i += groupingSize) {
      const slice = detectedBlocks.slice(i, i + groupingSize);
      const startTime = slice[0]?.startTime || '';
      const endTime = slice[slice.length - 1]?.endTime || '';
      const combinedText = slice.map((s) => s.text).join(' ');
      grouped.push({
        index: sceneIdx++,
        startTime,
        endTime,
        text: combinedText,
      });
    }
    return grouped;
  }, [detectedBlocks, groupingSize]);

  const expectedPromptCount = blocks.length;

  const existingIndices = React.useMemo(
    () => new Set(generatedPrompts.map((p) => p.index)),
    [generatedPrompts]
  );

  const missingBlocks = React.useMemo(
    () => blocks.filter((b) => !existingIndices.has(b.index)),
    [blocks, existingIndices]
  );

  const nextMissingIndex = missingBlocks[0]?.index ?? (generatedPrompts.length + 1);
  const canResume = generatedPrompts.length > 0 && missingBlocks.length > 0;

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

  const handleGenerate = async (resume = false) => {
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

    if (blocks.length === 0) {
      setError('Không tìm thấy nội dung phụ đề hợp lệ. Hãy kiểm tra định dạng file SRT hoặc dán văn bản phân dòng.');
      return;
    }

    const blocksToProcess = resume
      ? blocks.filter((b) => !existingIndices.has(b.index))
      : blocks;

    if (blocksToProcess.length === 0) {
      addNotification({
        type: 'info',
        message: 'Tất cả các đoạn SRT đã được tạo prompt đầy đủ!',
      });
      return;
    }

    setIsGenerating(true);
    abortRef.current = false;

    let allGenerated: GeneratedPrompt[] = [];
    if (resume) {
      // Keep existing prompts, continue next missing blocks
      allGenerated = [...generatedPrompts];
    } else {
      setGeneratedPrompts([]);
      setSelectedIndices(new Set());
    }

    setProgress({ done: allGenerated.length, total: blocks.length });

    // Process in batches of 10 blocks so LLMs never summarize or hit token caps
    const CHUNK_SIZE = 10;
    const totalRemainingChunks = Math.ceil(blocksToProcess.length / CHUNK_SIZE);
    let lastResultObj: GeneratePromptResult | null = null;

    try {
      const char = fixedCharacter.trim() || '[NHÂN VẬT CỐ ĐỊNH]';
      const style = fixedStyle.trim() || '[STYLE CỐ ĐỊNH]';

      for (let chunkIdx = 0; chunkIdx < totalRemainingChunks; chunkIdx++) {
        if (abortRef.current) break;

        const chunk = blocksToProcess.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
        const startNum = chunk[0].index;
        const endNum = chunk[chunk.length - 1].index;

        setStatusMessage(
          `Đang xử lý đoạn ${startNum} - ${endNum} / ${blocks.length} (Đợt ${chunkIdx + 1}/${totalRemainingChunks} - Đã xong ${allGenerated.length}/${blocks.length})...`
        );

        // Build system prompt: use custom formula if enabled, else use built-in
        let systemPrompt: string;
        if (useCustomFormula && customFormula.trim()) {
          systemPrompt = customFormula
            .replace(/\{COUNT\}/g, String(chunk.length))
            .replace(/\{CHARACTER\}/g, char)
            .replace(/\{STYLE\}/g, style)
            .replace(/\{START\}/g, String(startNum))
            .replace(/\{END\}/g, String(endNum));
        } else {
          systemPrompt = `Bạn là chuyên gia chuyển thể phụ đề / kịch bản SRT thành image prompts chất lượng cao cho AI tạo ảnh.

Nhiệm vụ: Tạo ĐÚNG ${chunk.length} image prompts từ đoạn số ${startNum} đến số ${endNum} dưới đây.

Yêu cầu bắt buộc:
- 1 block SRT = 1 prompt ảnh.
- Giữ nguyên số thứ tự block từ ${startNum} đến ${endNum}. KHÔNG gộp, KHÔNG bỏ, KHÔNG thêm block.
- Prompt viết bằng tiếng Anh.
- Mỗi prompt phải chuyển nội dung block SRT thành một cảnh hình ảnh cụ thể.
- Không dịch nguyên văn câu thoại — tập trung vào: nhân vật, hành động, cảm xúc, bối cảnh, không khí.
- Nếu block nói về ý trừu tượng, biến thành hình ảnh biểu tượng dễ hiểu.
- Nếu có người thật/nhân vật nổi tiếng, dùng mô tả an toàn: "fictional character inspired by the story".
- Không dùng chữ, số, logo, huy hiệu, quốc huy, cờ, watermark trong ảnh.
- Nếu block có xuất hiện nhân vật chính (người kể chuyện/"bạn" trong SRT): BẮT BUỘC chèn nguyên văn NHÂN VẬT CỐ ĐỊNH vào ngay sau mô tả cảnh. KHÔNG diễn giải lại, rút gọn, hay mô tả theo cách khác.
- Nếu block KHÔNG có nhân vật chính (chỉ tả cảnh vật, đồ vật, nhân vật phụ): BỎ QUA phần NHÂN VẬT CỐ ĐỊNH ở block đó.
- Cuối MỖI prompt phải thêm đúng STYLE CỐ ĐỊNH.
- KHÔNG sửa, rút gọn hoặc thay đổi NHÂN VẬT CỐ ĐỊNH hoặc STYLE CỐ ĐỊNH.
${char === '[NHÂN VẬT CỐ ĐỊNH]' ? '- NHÂN VẬT CỐ ĐỊNH chưa được điền → ghi đúng: [NHÂN VẬT CỐ ĐỊNH]' : `- NHÂN VẬT CỐ ĐỊNH: ${char}`}
${style === '[STYLE CỐ ĐỊNH]' ? '- STYLE CỐ ĐỊNH chưa được điền → ghi đúng: [STYLE CỐ ĐỊNH]' : `- STYLE CỐ ĐỊNH: ${style}`}

Output FORMAT — BẮT BUỘC đúng ${chunk.length} dòng:
${startNum}. [image prompt], [NHÂN VẬT CỐ ĐỊNH nếu có nhân vật chính], ${style}
...
${endNum}. [image prompt], [NHÂN VẬT CỐ ĐỊNH nếu có nhân vật chính], ${style}`;
        }

        const chunkContent = chunk
          .map((b) => `${b.index}. ${b.startTime ? `[${b.startTime} --> ${b.endTime}] ` : ''}${b.text}`)
          .join('\n\n');

        const result = await generatePromptWithFailover({
          systemPrompt,
          userContent: `Nội dung ${chunk.length} đoạn phụ đề cần tạo prompt:\n\n${chunkContent}`,
          settings,
          onStatusUpdate: (status) => {
            setStatusMessage(`[Đoạn ${startNum}-${endNum}] ${status.message}`);
            if (status.isWarning) {
              addNotification({
                type: 'warning',
                message: status.message,
              });
            }
          },
        });

        if (abortRef.current) break;
        lastResultObj = result;

        // Parse response lines for this chunk
        const lines = result.text.trim().split('\n');
        const chunkParsed: GeneratedPrompt[] = [];
        let seq = 0;

        for (const line of lines) {
          const match = line.match(/^(?:\[?(\d+)\]?[\.\:\-]?\s+)(.+)$/);
          if (match) {
            const rawNum = parseInt(match[1]);
            const promptText = match[2].trim();
            // Match to chunk block by original index or fallback to sequence
            let targetBlock = chunk.find((b) => b.index === rawNum);
            if (!targetBlock && rawNum >= 1 && rawNum <= chunk.length) {
              targetBlock = chunk[rawNum - 1];
            }
            if (!targetBlock && chunk[seq]) {
              targetBlock = chunk[seq];
            }
            if (targetBlock) {
              // Avoid duplicates in this chunk
              if (!chunkParsed.some((p) => p.index === targetBlock!.index)) {
                chunkParsed.push({
                  index: targetBlock.index,
                  srtText: targetBlock.text,
                  prompt: promptText,
                  edited: false,
                });
                seq++;
              }
            }
          }
        }

        // Fill any missed blocks in this chunk so we NEVER lose any block
        for (const b of chunk) {
          if (!chunkParsed.some((p) => p.index === b.index)) {
            const charPart = fixedCharacter.trim() ? `, ${fixedCharacter.trim()}` : '';
            const stylePart = fixedStyle.trim()
              ? `, ${fixedStyle.trim()}`
              : ', cinematic lighting, ultra detailed, 8k resolution';
            const safePrompt = `Cinematic scene depicting: ${b.text}${charPart}${stylePart}`;
            chunkParsed.push({
              index: b.index,
              srtText: b.text,
              prompt: safePrompt,
              edited: false,
            });
          }
        }

        chunkParsed.sort((a, b) => a.index - b.index);

        // Merge chunk into allGenerated without duplicates
        for (const item of chunkParsed) {
          const existingIdx = allGenerated.findIndex((p) => p.index === item.index);
          if (existingIdx >= 0) {
            allGenerated[existingIdx] = item;
          } else {
            allGenerated.push(item);
          }
        }
        allGenerated.sort((a, b) => a.index - b.index);

        setGeneratedPrompts([...allGenerated]);
        setSelectedIndices(new Set(allGenerated.map((p) => p.index)));
        setProgress({ done: allGenerated.length, total: blocks.length });
      }

      if (lastResultObj) {
        setLastGenResult(lastResultObj);
      }

      if (allGenerated.length > 0) {
        const fallbackNote =
          lastResultObj && lastResultObj.fallbackCount > 0
            ? ` (đã tự động chuyển đổi từ ${lastResultObj.attempts.filter((a) => !a.success).map((a) => a.name).join(', ')} do lỗi/hết quota)`
            : '';

        addNotification({
          type: 'success',
          message: `Đã tạo thành công ${allGenerated.length} image prompt từ SRT${fallbackNote}!`,
        });
      }
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

    const batchId = `srt_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const inputs = selected.map((p, i) => ({
      type: 'image' as const,
      name: `Prompt-SRT-${p.index}`,
      prompt: p.prompt,
      aspectRatio,
      metadata: {
        batchId,
        batchIndex: i + 1,
        batchTotal: selected.length,
        isBatch: true,
        srtIndex: p.index,
      },
    }));

    await createBatchJobs(inputs);
    addNotification({
      type: 'success',
      message: `Đã thêm ${inputs.length} prompt vào hàng đợi tạo ảnh (dự án chung)!`,
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
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Phát hiện: <strong className="text-emerald-400 font-semibold">{detectedBlocks.length}</strong> đoạn phụ đề
                </span>
                <span>
                  Dự kiến tạo: <strong className="text-violet-400 font-semibold">{expectedPromptCount}</strong> prompt
                </span>
              </div>
            )}

            {/* Grouping Mode Selector */}
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-300">Chế độ phân cảnh</span>
                <span className="text-slate-500 text-[10px]">
                  {groupingSize === 1
                    ? '1:1 - Mỗi đoạn 1 prompt ảnh'
                    : `Gộp ${groupingSize} đoạn thành 1 prompt`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { size: 1, label: '1:1 (Tất cả)' },
                  { size: 2, label: 'Gộp 2 đoạn' },
                  { size: 3, label: 'Gộp 3 đoạn' },
                  { size: 5, label: 'Gộp 5 đoạn' },
                ].map((opt) => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setGroupingSize(opt.size)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-all ${
                      groupingSize === opt.size
                        ? 'bg-violet-600 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
              Sẽ được chèn nguyên văn vào prompt khi block SRT có nhân vật chính xuất hiện.
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
              Sẽ được thêm vào cuối mỗi prompt.
            </p>
          </div>

          {/* ── Custom Formula Toggle ── */}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            {/* Toggle Header */}
            <button
              type="button"
              onClick={() => setUseCustomFormula((v) => !v)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors ${
                useCustomFormula
                  ? 'bg-amber-950/40 border-b border-amber-800/50'
                  : 'bg-slate-900/60 hover:bg-slate-900'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold">
                <FlaskConical className={`w-3.5 h-3.5 ${useCustomFormula ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className={useCustomFormula ? 'text-amber-300' : 'text-slate-400'}>
                  Công thức tùy chỉnh
                </span>
                {useCustomFormula && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                    ĐANG BẬT
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">
                  {useCustomFormula ? 'Tắt' : 'Bật để tùy chỉnh'}
                </span>
                {useCustomFormula ? (
                  <ToggleRight className="w-5 h-5 text-amber-400" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-slate-600" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {useCustomFormula && (
              <div className="p-3.5 space-y-3 bg-amber-950/10">
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-amber-300 leading-relaxed space-y-1">
                      <p className="font-semibold">Biến thay thế trong công thức:</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-amber-200/80">
                        <span><code className="text-amber-400">{'{COUNT}'}</code> — số prompt trong đợt</span>
                        <span><code className="text-amber-400">{'{CHARACTER}'}</code> — Nhân vật cố định</span>
                        <span><code className="text-amber-400">{'{STYLE}'}</code> — Style cố định</span>
                        <span><code className="text-amber-400">{'{START}'}</code> — số đoạn đầu</span>
                        <span><code className="text-amber-400">{'{END}'}</code> — số đoạn cuối</span>
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={customFormula}
                    onChange={(e) => setCustomFormula(e.target.value)}
                    rows={14}
                    spellCheck={false}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-amber-800/40 text-[11px] font-mono text-amber-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none leading-relaxed transition-colors"
                    placeholder="Nhập công thức tùy chỉnh của bạn..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomFormula(DEFAULT_FORMULA)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all"
                  >
                    Khôi phục công thức mặc định
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFormula('')}
                    className="py-1.5 px-3 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-rose-400 hover:text-rose-300 hover:border-rose-800 transition-all"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error & Retry Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-rose-300 leading-relaxed whitespace-pre-line font-medium">{error}</p>
                </div>
              </div>
              {canResume && (
                <div className="pt-2 border-t border-rose-500/20 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-rose-300/80">
                    Đã giữ <strong>{generatedPrompts.length}</strong> prompt đã hoàn thành
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-rose-900/40"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Thử lại từ prompt {nextMissingIndex}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Real-time Status / Failover Message */}
          {isGenerating && statusMessage && (
            <div className="p-3 rounded-xl bg-violet-950/50 border border-violet-800/60 flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />
              <span className="text-xs text-violet-200 leading-relaxed font-medium">{statusMessage}</span>
            </div>
          )}

          {/* Progress Bar when Generating */}
          {isGenerating && progress && progress.total > 0 && (
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Tiến độ tạo prompt</span>
                <span className="font-semibold text-violet-300">
                  {progress.done} / {progress.total} ({Math.round((progress.done / progress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-violet-500 to-purple-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Generate / Resume Buttons */}
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              Dừng lại {progress ? `(Đã tạo ${progress.done}/${progress.total})` : ''}
            </button>
          ) : canResume ? (
            <div className="space-y-2">
              <button
                onClick={() => handleGenerate(true)}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-600/30 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                Tiếp tục tạo từ prompt {nextMissingIndex} ({generatedPrompts.length}/{expectedPromptCount} đã xong)
              </button>
              <button
                onClick={() => handleGenerate(false)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center justify-center gap-1.5 border border-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tạo lại từ đầu (xoá {generatedPrompts.length} prompt cũ)
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleGenerate(false)}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-600/30 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {generatedPrompts.length >= expectedPromptCount && expectedPromptCount > 0
                ? `Đã xong tất cả — Tạo lại từ đầu (${expectedPromptCount} prompts)`
                : `Tạo Prompt từ SRT ${expectedPromptCount > 0 ? `(${expectedPromptCount} prompts)` : ''}`}
            </button>
          )}
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
