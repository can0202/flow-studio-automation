import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/app-store.ts';
import {
  Sliders,
  Folder,
  Zap,
  RotateCw,
  Globe,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Bot,
  Gauge,
  Activity,
  AlertTriangle,
  XCircle,
  Cpu,
} from 'lucide-react';
import {
  checkAllAiQuotas,
  AiQuotaInfo,
  getAiUsageToday,
} from '../services/ai-prompt-service';
import { AiPromptProvider } from '@shared/types.ts';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addNotification } = useAppStore();

  const [concurrency, setConcurrency] = useState(1);
  const [maxRetries, setMaxRetries] = useState(3);
  const [strictSessionBinding, setStrictSessionBinding] = useState(true);
  const [accountConcurrency, setAccountConcurrency] = useState(true);
  const [outputDir, setOutputDir] = useState('');
  const [projectName, setProjectName] = useState('FlowStudioProject');
  const [flowUrl, setFlowUrl] = useState('');
  const [simulationMode, setSimulationMode] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [preferredAiProvider, setPreferredAiProvider] = useState<AiPromptProvider>('gemini');

  // Quota checking state
  const [quotas, setQuotas] = useState<AiQuotaInfo[] | null>(null);
  const [isCheckingQuotas, setIsCheckingQuotas] = useState(false);

  const handleCheckQuotas = async () => {
    setIsCheckingQuotas(true);
    try {
      const q = await checkAllAiQuotas({
        ...settings,
        geminiApiKey,
        groqApiKey,
        openaiApiKey,
        claudeApiKey,
      } as any);
      setQuotas(q);
    } catch {
      // Ignore
    } finally {
      setIsCheckingQuotas(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setConcurrency(settings.concurrencyLimit);
      setMaxRetries(settings.defaultMaxRetries);
      setStrictSessionBinding(settings.strictSessionBinding !== false);
      setAccountConcurrency(settings.accountConcurrency !== false);
      setOutputDir(settings.outputDir);
      setProjectName(settings.defaultProjectName);
      setFlowUrl(settings.flowUrl);
      setSimulationMode(settings.simulationMode);
      setGeminiApiKey(settings.geminiApiKey || '');
      setGroqApiKey(settings.groqApiKey || '');
      setOpenaiApiKey(settings.openaiApiKey || '');
      setClaudeApiKey(settings.claudeApiKey || '');
      setPreferredAiProvider(settings.preferredAiProvider || 'gemini');

      // Tự động kiểm tra quota nếu đã có key
      if (settings.geminiApiKey || settings.groqApiKey || settings.openaiApiKey || settings.claudeApiKey) {
        checkAllAiQuotas(settings).then(setQuotas).catch(() => { });
      }
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({
      concurrencyLimit: concurrency,
      defaultMaxRetries: maxRetries,
      strictSessionBinding,
      accountConcurrency,
      outputDir: outputDir.trim(),
      defaultProjectName: projectName.trim(),
      flowUrl: flowUrl.trim(),
      simulationMode,
      geminiApiKey: geminiApiKey.trim(),
      groqApiKey: groqApiKey.trim(),
      openaiApiKey: openaiApiKey.trim(),
      claudeApiKey: claudeApiKey.trim(),
      preferredAiProvider,
    });
    handleCheckQuotas();
  };

  const handleBrowseFolder = async () => {
    const selected = await window.api.selectFolder();
    if (selected) {
      setOutputDir(selected);
    }
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)] ">
      {/* Simulation Mode Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r bg-amber-50/70 border border-amber-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-700">
              <Zap className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A0A4A]">Chế độ giả lập (Simulation Mode)</h3>
              <p className="text-xs text-[#4A4070]">
                Sử dụng Mock Provider để kiểm thử queue, concurrency, retry, dependency và phục hồi sau crash mà không cần gửi request tới Google Flow.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={simulationMode}
              onChange={(e) => setSimulationMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#5F2CFF] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#E2E6FF] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-6">
        <h3 className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#5F2CFF]" />
          <span>Cấu hình Hệ thống & Queue</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Output Directory */}
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">
              Thư mục lưu Output (Local Output Directory)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-xs font-mono text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
              />
              <button
                onClick={handleBrowseFolder}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#F0F3FF] hover:bg-[#E8ECFF] text-[#1A0A4A] border border-[#C4CEFF] flex items-center gap-1.5 shrink-0"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Chọn Thư Mục</span>
              </button>
            </div>
          </div>

          {/* Concurrency Limit */}
          <div>
            <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">
              Giới hạn số job chạy song song (Concurrency Limit)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
            />
            <span className="text-[11px] text-[#8B85B8] mt-1 block">
              Mặc định mỗi session chỉ chạy 1 job tại một thời điểm.
            </span>
          </div>

          {/* Default Max Retries */}
          <div>
            <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">
              Số lần thử lại tối đa (Max Retries)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
            />
            <span className="text-[11px] text-[#8B85B8] mt-1 block">
              Thử lại với exponential backoff khi gặp lỗi tạm thời (mạng, timeout).
            </span>
          </div>

          {/* Multi-thread and Session Binding Controls */}
          <div className="sm:col-span-2 p-4 rounded-xl bg-white/80 border border-[#E2E6FF] space-y-3">
            <span className="text-xs font-bold text-[#1A0A4A] block uppercase tracking-wider">
              Cơ chế Điều phối Đa luồng & Quota (Multi-threading Rules)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Strict Session Binding */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-[#F4F6FF]/70 border border-[#E2E6FF] cursor-pointer hover:border-[#C4CEFF] transition-colors">
                <input
                  type="checkbox"
                  checked={strictSessionBinding}
                  onChange={(e) => setStrictSessionBinding(e.target.checked)}
                  className="mt-0.5 rounded text-[#5F2CFF] focus:ring-0"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[#1A0A4A] block">
                    Cố định tài khoản (Strict Session Binding)
                  </span>
                  <span className="text-[11px] text-[#4A4070] block">
                    Tác vụ của tài khoản nào chỉ chạy trên tài khoản đó. Không tự ý nhảy tài khoản làm lẫn lộn dự án.
                  </span>
                </div>
              </label>

              {/* Account-based Concurrency */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-[#F4F6FF]/70 border border-[#E2E6FF] cursor-pointer hover:border-[#C4CEFF] transition-colors">
                <input
                  type="checkbox"
                  checked={accountConcurrency}
                  onChange={(e) => setAccountConcurrency(e.target.checked)}
                  className="mt-0.5 rounded text-[#5F2CFF] focus:ring-0"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[#1A0A4A] block">
                    Đa luồng theo từng tài khoản (1 Luồng / 1 Tài khoản)
                  </span>
                  <span className="text-[11px] text-[#4A4070] block">
                    Mỗi tài khoản tại một thời điểm chỉ mở tối đa 1 trình duyệt. Triệt tiêu 100% lỗi xung đột Chromium file lock.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Default Project Name */}
          <div>
            <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Tên Project Mặc Định</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
            />
          </div>

          {/* Google Flow URL */}
          <div>
            <label className="text-xs font-semibold text-[#4A4070] block mb-1.5">Google Flow URL</label>
            <input
              type="text"
              value={flowUrl}
              onChange={(e) => setFlowUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm font-mono text-[#1A0A4A] focus:outline-none focus:border-[#5F2CFF]"
            />
          </div>

          {/* AI Providers Section (Gemini, ChatGPT, Claude) */}
          <div className="sm:col-span-2 pt-4 border-t border-[#E2E6FF] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7B52FF]" />
                <span>Cấu hình AI Tạo Prompt SRT (Multi-Provider & Auto-Failover)</span>
              </label>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F0F3FF]/40 border border-[#E2E6FF] text-[11px] text-[#9B7AFF]">
                <RefreshCw className="w-3 h-3 text-[#7B52FF] animate-spin-slow" />
                <span>Tự động chuyển đổi khi hết quota</span>
              </div>
            </div>

            <p className="text-xs text-[#4A4070] leading-relaxed">
              Nhập ít nhất 1 API key. Bạn có thể nhập cả 3 để tạo chuỗi dự phòng:{' '}
              <span className="text-[#4A4070] font-medium">
                khi provider đang dùng bị hết quota hoặc giới hạn tốc độ (Rate Limit), hệ thống sẽ tự động chuyển sang provider tiếp theo
              </span>{' '}
              ngay lập tức mà không bị gián đoạn.
            </p>

            {/* Provider ưu tiên */}
            <div className="p-3.5 rounded-xl bg-white/80 border border-[#E2E6FF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#4A4070] block">Ưu tiên gọi trước (Primary Provider)</span>
                <span className="text-[11px] text-[#8B85B8]">Nếu provider này hết quota sẽ tự động chuyển sang các provider khác có key</span>
              </div>
              <select
                value={preferredAiProvider}
                onChange={(e) => setPreferredAiProvider(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg bg-[#F4F6FF] border border-[#C4CEFF] text-xs text-[#1A0A4A] focus:outline-none focus:border-[#7B52FF] font-medium"
              >
                <option value="gemini">1. Google Gemini (Mặc định)</option>
                <option value="openai">2. OpenAI (ChatGPT / gpt-4o-mini)</option>
                <option value="claude">3. Anthropic (Claude 3.5)</option>
              </select>
            </div>

            {/* 1. Google Gemini */}
            <div className="p-3.5 rounded-xl bg-white/40 border border-[#E2E6FF]/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#4A4070] flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#0EA5E9]" />
                  Google Gemini API Key
                  {geminiApiKey && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-800/50">Đã thiết lập</span>}
                </label>
                <button
                  type="button"
                  onClick={() => window.api.openExternal('https://aistudio.google.com/apikey')}
                  className="text-[11px] text-[#0EA5E9] hover:text-[#0EA5E9] hover:underline flex items-center gap-1"
                >
                  Lấy key miễn phí tại Google AI Studio ↗
                </button>
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm font-mono text-[#1A0A4A] focus:outline-none focus:border-[#0EA5E9]"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B85B8] hover:text-[#4A4070]"
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-[#8B85B8] block">
                Hỗ trợ tự động các model Gemini mới (gemini-3.8-flash, gemini-2.5-flash). Miễn phí 1,500 lượt/ngày tại Google AI Studio.
              </span>
            </div>

            {/* 2. Groq (Llama 3.3 70B - Free) */}
            <div className="p-3.5 rounded-xl bg-white/40 border border-[#E2E6FF]/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#4A4070] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-orange-400" />
                  Groq API Key (Llama 3.3 70B - Miễn phí)
                  {groqApiKey && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-800/50">Đã thiết lập</span>}
                </label>
                <button
                  type="button"
                  onClick={() => window.api.openExternal('https://console.groq.com/keys')}
                  className="text-[11px] text-orange-400 hover:text-orange-300 hover:underline flex items-center gap-1"
                >
                  Lấy key miễn phí tại Groq Console ↗
                </button>
              </div>
              <div className="relative">
                <input
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm font-mono text-[#1A0A4A] focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B85B8] hover:text-[#4A4070]"
                >
                  {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-[#8B85B8] block">
                Tốc độ xử lý siêu tốc LPU (~300 tokens/s). Miễn phí 1,000 lượt gọi/ngày với model Llama 3.3 70B Versatile.
              </span>
            </div>

            {/* 3. OpenAI ChatGPT */}
            <div className="p-3.5 rounded-xl bg-white/40 border border-[#E2E6FF]/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#4A4070] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                  OpenAI (ChatGPT) API Key
                  {openaiApiKey && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-800/50">Đã thiết lập</span>}
                </label>
                <button
                  type="button"
                  onClick={() => window.api.openExternal('https://platform.openai.com/api-keys')}
                  className="text-[11px] text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                >
                  Lấy key tại OpenAI Platform ↗
                </button>
              </div>
              <div className="relative">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm font-mono text-[#1A0A4A] focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B85B8] hover:text-[#4A4070]"
                >
                  {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-[#8B85B8] block">
                Sử dụng model gpt-4o-mini (nhanh, rẻ và tạo cảnh hình ảnh rất chuẩn).
              </span>
            </div>

            {/* 3. Anthropic Claude */}
            <div className="p-3.5 rounded-xl bg-white/40 border border-[#E2E6FF]/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#4A4070] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  Anthropic (Claude) API Key
                  {claudeApiKey && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-800/50">Đã thiết lập</span>}
                </label>
                <button
                  type="button"
                  onClick={() => window.api.openExternal('https://console.anthropic.com/settings/keys')}
                  className="text-[11px] text-amber-700 hover:text-amber-700 hover:underline flex items-center gap-1"
                >
                  Lấy key tại Anthropic Console ↗
                </button>
              </div>
              <div className="relative">
                <input
                  type={showClaudeKey ? 'text' : 'password'}
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder="sk-ant-api..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-[#E2E6FF] shadow-sm text-sm font-mono text-[#1A0A4A] focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowClaudeKey(!showClaudeKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B85B8] hover:text-[#4A4070]"
                >
                  {showClaudeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-[#8B85B8] block">
                Sử dụng Claude 3.5 Haiku / Sonnet (văn phong sáng tạo và hiểu ngữ cảnh SRT sâu sắc).
              </span>
            </div>

            {/* AI Quota Monitoring Dashboard */}
            <div className="pt-4 border-t border-[#E2E6FF] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-emerald-600" />
                    Bảng Giám Sát Quota & Hạn Mức Từng AI
                  </span>
                  <span className="text-[11px] text-[#8B85B8]">
                    Theo dõi số lượng requests còn lại, trạng thái kết nối và số lượt đã dùng trong ngày.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckQuotas}
                  disabled={isCheckingQuotas}
                  className="px-3 py-1.5 rounded-lg bg-[#F0F3FF] hover:bg-[#E8ECFF] text-xs text-[#4A4070] border border-[#C4CEFF] transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingQuotas ? 'animate-spin text-[#7B52FF]' : ''}`} />
                  <span>{isCheckingQuotas ? 'Đang kiểm tra...' : 'Kiểm tra Quota ngay'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {(quotas || [
                  { provider: 'gemini', name: 'Google Gemini', hasKey: Boolean(geminiApiKey), status: geminiApiKey ? 'checking' : 'unconfigured', statusText: geminiApiKey ? 'Đang tải...' : 'Chưa cấu hình', tierLimit: '1,500 requests/ngày', usedToday: getAiUsageToday().gemini },
                  { provider: 'groq', name: 'Groq (Llama 70B - Free)', hasKey: Boolean(groqApiKey), status: groqApiKey ? 'checking' : 'unconfigured', statusText: groqApiKey ? 'Đang tải...' : 'Chưa cấu hình', tierLimit: '1,000 req/ngày', usedToday: getAiUsageToday().groq },
                  { provider: 'openai', name: 'OpenAI (ChatGPT)', hasKey: Boolean(openaiApiKey), status: openaiApiKey ? 'checking' : 'unconfigured', statusText: openaiApiKey ? 'Đang tải...' : 'Chưa cấu hình', tierLimit: 'Pay-as-you-go', usedToday: getAiUsageToday().openai },
                  { provider: 'claude', name: 'Anthropic (Claude)', hasKey: Boolean(claudeApiKey), status: claudeApiKey ? 'checking' : 'unconfigured', statusText: claudeApiKey ? 'Đang tải...' : 'Chưa cấu hình', tierLimit: 'Credits Tier', usedToday: getAiUsageToday().claude },
                ]).map((q) => {
                  const isGemini = q.provider === 'gemini';
                  const isOpenAi = q.provider === 'openai';

                  return (
                    <div
                      key={q.provider}
                      className="p-3.5 rounded-xl bg-[#F4F6FF]/60 border border-[#E2E6FF] flex flex-col space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#1A0A4A] flex items-center gap-1.5">
                            {isGemini ? (
                              <Key className="w-3.5 h-3.5 text-[#0EA5E9]" />
                            ) : isOpenAi ? (
                              <Bot className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                            )}
                            {q.name}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${q.status === 'active'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : q.status === 'out_of_quota'
                                ? 'bg-rose-50 border-rose-200 text-rose-600'
                                : q.status === 'invalid_key'
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : q.status === 'checking'
                                    ? 'bg-[#F0F3FF]/60 border-[#7B52FF]/40 text-[#7B52FF]'
                                    : 'bg-white border-[#E2E6FF] text-[#8B85B8]'
                              }`}
                          >
                            {q.status === 'active'
                              ? '🟢 Sẵn sàng'
                              : q.status === 'out_of_quota'
                                ? '🔴 Hết Quota'
                                : q.status === 'invalid_key'
                                  ? '🟡 Lỗi Key'
                                  : q.status === 'checking'
                                    ? '⏳ Đang kiểm tra'
                                    : '⚪ Chưa có key'}
                          </span>
                        </div>

                        <p className="text-[11px] text-[#4A4070] leading-tight">
                          {q.statusText}
                        </p>
                      </div>

                      {/* Quota details */}
                      <div className="p-2 rounded-lg bg-[#F0F3FF]/80 border border-[#E2E6FF] text-[11px] space-y-1">
                        <div className="flex justify-between items-center text-[#4A4070]">
                          <span>Hạn mức chuẩn:</span>
                          <span className="font-medium text-[#1A0A4A]">{q.tierLimit}</span>
                        </div>
                        {q.remainingRequests !== undefined && (
                          <div className="flex justify-between items-center text-[#4A4070]">
                            <span>Requests còn lại:</span>
                            <span className="font-semibold text-emerald-600">
                              {q.remainingRequests}
                            </span>
                          </div>
                        )}
                        {q.remainingTokens && (
                          <div className="flex justify-between items-center text-[#4A4070]">
                            <span>Tokens còn lại:</span>
                            <span className="font-mono text-[10px] text-[#4A4070]">
                              {q.remainingTokens}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-[#4A4070] pt-1 border-t border-[#E2E6FF]/60">
                          <span>Đã dùng hôm nay:</span>
                          <span className="font-bold text-[#7B52FF]">{q.usedToday} lượt</span>
                        </div>
                      </div>

                      {q.lastChecked && (
                        <span className="text-[10px] text-[#4A4070] block text-right">
                          Cập nhật lúc: {q.lastChecked}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E2E6FF] flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#5F2CFF] hover:bg-[#7B52FF] text-white shadow-md shadow-[#5F2CFF]/25 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Lưu Cài Đặt</span>
          </button>
        </div>
      </div>

      {/* Safety & Architecture Summary */}
      <div className="p-6 rounded-2xl border border-[#E2E6FF] bg-white space-y-3">
        <h3 className="text-sm font-bold text-[#1A0A4A] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Local MVP Architecture & Compliance</span>
        </h3>
        <ul className="text-xs text-[#4A4070] space-y-1.5 list-disc list-inside leading-relaxed">
          <li>Chạy hoàn toàn local trên Windows, dữ liệu lưu trong SQLite và thư mục máy tính của bạn.</li>
          <li>Preload an toàn với Context Isolation, không để renderer can thiệp Node.js.</li>
          <li>Không lưu mật khẩu Google, không bypass CAPTCHA/2FA, không xuất cookie tùy tiện.</li>
          <li>Tự động ngắt worker khi tài khoản chạm ngưỡng quota để bảo vệ tài khoản.</li>
        </ul>
      </div>
    </div>
  );
};
