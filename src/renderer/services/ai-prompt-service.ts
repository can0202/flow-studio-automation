import { AiPromptProvider, Settings } from '../../shared/types';

export interface GeneratePromptResult {
  text: string;
  provider: AiPromptProvider;
  providerName: string;
  fallbackCount: number;
  attempts: {
    provider: AiPromptProvider;
    name: string;
    success: boolean;
    error?: string;
  }[];
}

export type StatusUpdateCallback = (status: {
  provider: AiPromptProvider;
  providerName: string;
  message: string;
  isWarning?: boolean;
}) => void;

// ─── Usage Tracking (Lịch sử sử dụng hàng ngày trong App) ──────────────────────

interface DailyAiUsage {
  date: string;
  gemini: number;
  openai: number;
  claude: number;
}

const USAGE_STORAGE_KEY = 'flow_studio_ai_usage_daily_v1';

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getAiUsageToday(): {
  gemini: number;
  openai: number;
  claude: number;
  total: number;
} {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    const today = getTodayString();
    if (raw) {
      const parsed: DailyAiUsage = JSON.parse(raw);
      if (parsed.date === today) {
        return {
          gemini: parsed.gemini || 0,
          openai: parsed.openai || 0,
          claude: parsed.claude || 0,
          total: (parsed.gemini || 0) + (parsed.openai || 0) + (parsed.claude || 0),
        };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return { gemini: 0, openai: 0, claude: 0, total: 0 };
}

export function incrementAiUsage(provider: AiPromptProvider): void {
  try {
    const today = getTodayString();
    const current = getAiUsageToday();
    const updated: DailyAiUsage = {
      date: today,
      gemini: provider === 'gemini' ? current.gemini + 1 : current.gemini,
      openai: provider === 'openai' ? current.openai + 1 : current.openai,
      claude: provider === 'claude' ? current.claude + 1 : current.claude,
    };
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// ─── Quota Information Interfaces ─────────────────────────────────────────────

export interface AiQuotaInfo {
  provider: AiPromptProvider;
  name: string;
  hasKey: boolean;
  status: 'active' | 'out_of_quota' | 'invalid_key' | 'unconfigured' | 'error' | 'checking';
  statusText: string;
  tierLimit: string;
  remainingRequests?: number | string;
  limitRequests?: number | string;
  remainingTokens?: number | string;
  limitTokens?: number | string;
  usedToday: number;
  lastChecked?: string;
  errorDetail?: string;
}

// ─── Gemini API (với auto-fallback giữa các models) ──────────────────────────

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
];

function isTransientError(errMsg: string, status?: number): boolean {
  const lower = (errMsg || '').toLowerCase();
  return (
    status === 503 ||
    status === 500 ||
    status === 504 ||
    lower.includes('high demand') ||
    lower.includes('spikes in demand') ||
    lower.includes('overloaded') ||
    lower.includes('try again later') ||
    lower.includes('temporarily') ||
    lower.includes('unavailable') ||
    (status === 429 && !lower.includes('quota'))
  );
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Delay before retrying on high demand / transient server error
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + userContent }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const errMsg = err?.error?.message || `HTTP ${response.status} ${response.statusText}`;

          // If model not found, deprecated or unsupported on this tier -> try next model
          if (
            response.status === 404 ||
            errMsg.includes('not found') ||
            errMsg.includes('no longer available') ||
            errMsg.includes('is not supported') ||
            errMsg.includes('limit: 0')
          ) {
            lastError = new Error(`Model ${model}: ${errMsg}`);
            continue;
          }

          // If model has temporary high demand / server overloaded / 503 / 429 -> try next model in GEMINI_MODELS
          if (isTransientError(errMsg, response.status)) {
            lastError = new Error(`Google Gemini (${model}) đang quá tải/high demand: ${errMsg}`);
            continue;
          }

          throw new Error(errMsg);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini không trả về nội dung text.');
        return text;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || '';
        if (
          msg.includes('not found') ||
          msg.includes('no longer available') ||
          isTransientError(msg)
        ) {
          continue;
        }
        throw err;
      }
    }
  }

  throw lastError || new Error('Không thể kết nối với các model Gemini.');
}

// ─── OpenAI ChatGPT API ───────────────────────────────────────────────────────

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o'];

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  let lastError: Error | null = null;

  for (const model of OPENAI_MODELS) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errMsg = err?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        if (response.status === 404 && model !== OPENAI_MODELS[OPENAI_MODELS.length - 1]) {
          lastError = new Error(`OpenAI ${model}: ${errMsg}`);
          continue;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenAI không trả về nội dung text.');
      return text;
    } catch (err: any) {
      lastError = err;
      throw err;
    }
  }

  throw lastError || new Error('Không thể kết nối với OpenAI API.');
}

// ─── Anthropic Claude API ─────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022',
];

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  let lastError: Error | null = null;

  for (const model of CLAUDE_MODELS) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errMsg = err?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        if (response.status === 404 && model !== CLAUDE_MODELS[CLAUDE_MODELS.length - 1]) {
          lastError = new Error(`Claude ${model}: ${errMsg}`);
          continue;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const text = data?.content?.[0]?.text;
      if (!text) throw new Error('Claude không trả về nội dung text.');
      return text;
    } catch (err: any) {
      lastError = err;
      throw err;
    }
  }

  throw lastError || new Error('Không thể kết nối với Claude API.');
}

// ─── Quota Checking Methods ───────────────────────────────────────────────────

export async function checkGeminiQuota(apiKey: string): Promise<AiQuotaInfo> {
  const usage = getAiUsageToday();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {
      provider: 'gemini',
      name: 'Google Gemini',
      hasKey: false,
      status: 'unconfigured',
      statusText: 'Chưa cấu hình API Key',
      tierLimit: '1,500 requests/ngày (15 req/phút)',
      usedToday: usage.gemini,
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`,
      { method: 'GET' }
    );

    if (res.ok) {
      return {
        provider: 'gemini',
        name: 'Google Gemini',
        hasKey: true,
        status: 'active',
        statusText: 'Đang hoạt động (Key hợp lệ)',
        tierLimit: '1,500 requests/ngày (15 req/phút)',
        remainingRequests: `~${Math.max(0, 1500 - usage.gemini)}/1500 RPD`,
        usedToday: usage.gemini,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || `Lỗi HTTP ${res.status}`;

    if (res.status === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('resource_exhausted')) {
      return {
        provider: 'gemini',
        name: 'Google Gemini',
        hasKey: true,
        status: 'out_of_quota',
        statusText: 'Hết Quota / Vượt giới hạn',
        tierLimit: '1,500 requests/ngày (15 req/phút)',
        usedToday: usage.gemini,
        errorDetail: message,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    return {
      provider: 'gemini',
      name: 'Google Gemini',
      hasKey: true,
      status: 'invalid_key',
      statusText: 'Key không hợp lệ hoặc lỗi quyền',
      tierLimit: '1,500 requests/ngày',
      usedToday: usage.gemini,
      errorDetail: message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  } catch (err: any) {
    return {
      provider: 'gemini',
      name: 'Google Gemini',
      hasKey: true,
      status: 'error',
      statusText: 'Không thể kết nối đến Google AI Studio',
      tierLimit: '1,500 requests/ngày',
      usedToday: usage.gemini,
      errorDetail: err.message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  }
}

export async function checkOpenAiQuota(apiKey: string): Promise<AiQuotaInfo> {
  const usage = getAiUsageToday();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {
      provider: 'openai',
      name: 'OpenAI (ChatGPT)',
      hasKey: false,
      status: 'unconfigured',
      statusText: 'Chưa cấu hình API Key',
      tierLimit: 'Theo gói nạp Pay-as-you-go',
      usedToday: usage.openai,
    };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmed}`,
      },
    });

    if (res.ok) {
      const remainingReq = res.headers.get('x-ratelimit-remaining-requests');
      const limitReq = res.headers.get('x-ratelimit-limit-requests');
      const remainingTokens = res.headers.get('x-ratelimit-remaining-tokens');
      const limitTokens = res.headers.get('x-ratelimit-limit-tokens');

      return {
        provider: 'openai',
        name: 'OpenAI (ChatGPT)',
        hasKey: true,
        status: 'active',
        statusText: 'Đang hoạt động (Key hợp lệ)',
        tierLimit: limitReq ? `${limitReq} RPM` : 'Pay-as-you-go',
        remainingRequests: remainingReq || 'Không giới hạn cứng',
        limitRequests: limitReq || 'N/A',
        remainingTokens: remainingTokens || undefined,
        limitTokens: limitTokens || undefined,
        usedToday: usage.openai,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || `Lỗi HTTP ${res.status}`;

    if (res.status === 429 || err?.error?.code === 'insufficient_quota') {
      return {
        provider: 'openai',
        name: 'OpenAI (ChatGPT)',
        hasKey: true,
        status: 'out_of_quota',
        statusText: 'Hết Quota / Hết số dư Credit',
        tierLimit: 'Cần nạp thêm credit trên OpenAI Platform',
        usedToday: usage.openai,
        errorDetail: message,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    return {
      provider: 'openai',
      name: 'OpenAI (ChatGPT)',
      hasKey: true,
      status: 'invalid_key',
      statusText: 'Key không hợp lệ',
      tierLimit: 'Pay-as-you-go',
      usedToday: usage.openai,
      errorDetail: message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  } catch (err: any) {
    return {
      provider: 'openai',
      name: 'OpenAI (ChatGPT)',
      hasKey: true,
      status: 'error',
      statusText: 'Không thể kết nối đến OpenAI API',
      tierLimit: 'Pay-as-you-go',
      usedToday: usage.openai,
      errorDetail: err.message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  }
}

export async function checkClaudeQuota(apiKey: string): Promise<AiQuotaInfo> {
  const usage = getAiUsageToday();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {
      provider: 'claude',
      name: 'Anthropic (Claude)',
      hasKey: false,
      status: 'unconfigured',
      statusText: 'Chưa cấu hình API Key',
      tierLimit: 'Theo gói nạp Credits',
      usedToday: usage.claude,
    };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': trimmed,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });

    if (res.ok) {
      const remainingReq = res.headers.get('anthropic-ratelimit-requests-remaining');
      const limitReq = res.headers.get('anthropic-ratelimit-requests-limit');
      const remainingTokens = res.headers.get('anthropic-ratelimit-tokens-remaining');
      const limitTokens = res.headers.get('anthropic-ratelimit-tokens-limit');

      return {
        provider: 'claude',
        name: 'Anthropic (Claude)',
        hasKey: true,
        status: 'active',
        statusText: 'Đang hoạt động (Key hợp lệ)',
        tierLimit: limitReq ? `${limitReq} RPM` : 'Anthropic Credits Tier',
        remainingRequests: remainingReq || 'Sẵn sàng',
        limitRequests: limitReq || 'N/A',
        remainingTokens: remainingTokens || undefined,
        limitTokens: limitTokens || undefined,
        usedToday: usage.claude,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || `Lỗi HTTP ${res.status}`;

    if (
      res.status === 429 ||
      message.toLowerCase().includes('credit') ||
      message.toLowerCase().includes('quota')
    ) {
      return {
        provider: 'claude',
        name: 'Anthropic (Claude)',
        hasKey: true,
        status: 'out_of_quota',
        statusText: 'Hết Quota / Hết số dư Credits',
        tierLimit: 'Cần nạp credits tại Anthropic Console',
        usedToday: usage.claude,
        errorDetail: message,
        lastChecked: new Date().toLocaleTimeString('vi-VN'),
      };
    }

    return {
      provider: 'claude',
      name: 'Anthropic (Claude)',
      hasKey: true,
      status: 'invalid_key',
      statusText: 'Key không hợp lệ',
      tierLimit: 'Credits Tier',
      usedToday: usage.claude,
      errorDetail: message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  } catch (err: any) {
    return {
      provider: 'claude',
      name: 'Anthropic (Claude)',
      hasKey: true,
      status: 'error',
      statusText: 'Không thể kết nối đến Claude API',
      tierLimit: 'Credits Tier',
      usedToday: usage.claude,
      errorDetail: err.message,
      lastChecked: new Date().toLocaleTimeString('vi-VN'),
    };
  }
}

export async function checkAllAiQuotas(settings?: Settings | null): Promise<AiQuotaInfo[]> {
  const geminiPromise = checkGeminiQuota(settings?.geminiApiKey || '');
  const openAiPromise = checkOpenAiQuota(settings?.openaiApiKey || '');
  const claudePromise = checkClaudeQuota(settings?.claudeApiKey || '');

  return Promise.all([geminiPromise, openAiPromise, claudePromise]);
}

// ─── Provider Definitions & Auto Failover Orchestrator ─────────────────────────

interface ProviderInfo {
  id: AiPromptProvider;
  name: string;
  getKey: (settings?: Settings | null) => string;
  call: (key: string, sys: string, user: string) => Promise<string>;
}

const ALL_PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    getKey: (s) => (s?.geminiApiKey || '').trim(),
    call: callGemini,
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    getKey: (s) => (s?.openaiApiKey || '').trim(),
    call: callOpenAI,
  },
  {
    id: 'claude',
    name: 'Anthropic (Claude)',
    getKey: (s) => (s?.claudeApiKey || '').trim(),
    call: callClaude,
  },
];

export function getAvailableAiProviders(settings?: Settings | null): {
  id: AiPromptProvider;
  name: string;
  hasKey: boolean;
}[] {
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    hasKey: Boolean(p.getKey(settings)),
  }));
}

/**
 * Gọi AI tạo prompt với cơ chế tự động chuyển đổi (Failover) khi hết quota hoặc lỗi.
 */
export async function generatePromptWithFailover(options: {
  systemPrompt: string;
  userContent: string;
  settings?: Settings | null;
  onStatusUpdate?: StatusUpdateCallback;
}): Promise<GeneratePromptResult> {
  const { systemPrompt, userContent, settings, onStatusUpdate } = options;

  // Lấy các provider có cấu hình key
  const configuredProviders = ALL_PROVIDERS.filter((p) => Boolean(p.getKey(settings)));

  if (configuredProviders.length === 0) {
    throw new Error(
      'Chưa cấu hình API Key nào (Gemini, ChatGPT hoặc Claude). Vui lòng vào Cài đặt để thêm ít nhất 1 API key.'
    );
  }

  // Sắp xếp theo ưu tiên của người dùng nếu có cấu hình
  const preferred = settings?.preferredAiProvider;
  if (preferred) {
    configuredProviders.sort((a, b) => {
      if (a.id === preferred) return -1;
      if (b.id === preferred) return 1;
      return 0;
    });
  }

  const attempts: GeneratePromptResult['attempts'] = [];

  for (let i = 0; i < configuredProviders.length; i++) {
    const provider = configuredProviders[i];
    const key = provider.getKey(settings);
    const nextProvider = configuredProviders[i + 1];

    onStatusUpdate?.({
      provider: provider.id,
      providerName: provider.name,
      message: `Đang tạo prompt với ${provider.name}...`,
    });

    try {
      const text = await provider.call(key, systemPrompt, userContent);

      // Ghi nhận lượt sử dụng thành công trong ngày
      incrementAiUsage(provider.id);

      attempts.push({
        provider: provider.id,
        name: provider.name,
        success: true,
      });

      return {
        text,
        provider: provider.id,
        providerName: provider.name,
        fallbackCount: i,
        attempts,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Lỗi không xác định';
      attempts.push({
        provider: provider.id,
        name: provider.name,
        success: false,
        error: errorMessage,
      });

      // Nếu còn provider tiếp theo -> Thông báo chuyển đổi và tiếp tục
      if (nextProvider) {
        onStatusUpdate?.({
          provider: provider.id,
          providerName: provider.name,
          message: `⚠️ ${provider.name} lỗi/hết quota: "${errorMessage}". Đang tự động chuyển sang ${nextProvider.name}...`,
          isWarning: true,
        });
      }
    }
  }

  // Nếu tất cả providers đều thất bại
  const detailedErrors = attempts
    .map((a) => `• ${a.name}: ${a.error}`)
    .join('\n');

  throw new Error(
    `Tất cả API (${attempts.map((a) => a.name).join(', ')}) đều gặp lỗi hoặc hết quota:\n${detailedErrors}`
  );
}
