import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import type { Job, Session } from '../../../shared/types.ts';
import type { FlowProvider, GenerationProgress, GenerationResult } from './provider.interface.ts';
import type { OutputManager } from '../output-manager.ts';

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE FLOW URL CONSTANTS
// The tool can be at various URLs. We try both and follow the final landing.
// ─────────────────────────────────────────────────────────────────────────────
export const FLOW_URLS = {
  primary: 'https://flow.google.com',
  fallback: 'https://labs.google/fx/tools/flow',
  alternate: 'https://labs.google/fx',
};

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORS — ordered from most specific to most general
// Google Flow is a React SPA. Many elements are dynamically rendered, so we
// use multiple fallbacks per UI target.
// ─────────────────────────────────────────────────────────────────────────────
export const FLOW_SELECTORS = {
  // Authentication indicators
  authRequiredIndicators: [
    'a[href*="accounts.google.com/signin"]',
    'a[href*="accounts.google.com/ServiceLogin"]',
    'a[href*="accounts.google.com/InteractiveLogin"]',
    'button:has-text("Sign in")',
    'button:has-text("Sign In")',
    'button:has-text("Log in")',
    'button:has-text("Đăng nhập")',
    'a:has-text("Sign in")',
    'a:has-text("Đăng nhập")',
  ],
  userLoggedInIndicators: [
    'img[alt*="Google Account"]',
    'img[alt*="Tài khoản Google"]',
    '[aria-label*="Google Account"]',
    '[aria-label*="Tài khoản Google"]',
    'button[aria-label*="Account"]',
    'button[aria-label*="Tài khoản"]',
    'header img[src*="googleusercontent"]',
    'img[src*="googleusercontent"]',
    'img[src*="lh3.googleusercontent"]',
    '[data-testid="user-avatar"]',
    'a[href*="SignOutOptions"]',
    'button:has-text("New project")',
    'button:has-text("Dự án mới")',
    'button:has-text("Create")',
    'button:has-text("Tạo")',
    'textarea',
  ],
  quotaExhaustedIndicators: [
    ':text("quota exceeded")',
    ':text("reached your limit")',
    ':text("Out of credits")',
    ':text("Daily limit reached")',
    ':text("usage limit")',
    ':text("try again tomorrow")',
    '[data-testid="quota-exhausted"]',
  ],

  // Studio entry — marketing or landing page
  enterStudioButtons: [
    'button:has-text("Create with Google Flow")',
    'button:has-text("Try in Google Flow")',
    'a:has-text("Create with Google Flow")',
    'a:has-text("Try in Google Flow")',
    'button:has-text("Get started")',
    'button:has-text("Try Flow")',
    'a:has-text("Get started")',
    'a[href*="/fx/tools/flow"]',
    'a[href="/flow"]',
  ],

  // Dismiss disclaimers / onboarding modals
  modalDismissButtons: [
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Accept")',
    'button:has-text("Got it")',
    'button:has-text("Continue")',
    'button:has-text("Dismiss")',
    '[role="dialog"] button:has-text("Close")',
    '[aria-label="Close dialog"]',
    '[aria-label="Dismiss"]',
  ],

  // NEW PROJECT / Project dashboard
  newProjectButtons: [
    'button:has-text("New Project")',
    'button:has-text("New project")',
    'button:has-text("Create project")',
    '[aria-label*="New project" i]',
    '[data-testid="new-project-btn"]',
  ],

  // Mode / Tab switchers — Image vs Video
  modeSwitcher: {
    image: [
      'button:has-text("Image")',
      '[data-tab="image"]',
      '[aria-label="Image"]',
      'button:has-text("Nano Banana")',
      'button[data-mode="image"]',
      '[role="tab"]:has-text("Image")',
    ],
    video: [
      'button:has-text("Video")',
      '[data-tab="video"]',
      '[aria-label="Video"]',
      'button:has-text("Veo")',
      'button[data-mode="video"]',
      '[role="tab"]:has-text("Video")',
    ],
  },

  // Prompt input — ordered from most specific to fallback
  // Google Flow typically uses a large textarea or contenteditable div
  promptInput: [
    // Specific attribute-based selectors
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="describe" i]',
    'textarea[placeholder*="Describe" i]',
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="imagine" i]',
    'textarea[placeholder*="Write" i]',
    'textarea[placeholder*="Enter" i]',
    '[role="textbox"][aria-label*="prompt" i]',
    '[role="textbox"][aria-label*="describe" i]',
    // ContentEditable divs used by many modern SPAs
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'div[contenteditable="true"][aria-label*="describe" i]',
    'div[contenteditable="true"][aria-multiline="true"]',
    // Generic fallbacks
    'textarea:not([readonly])',
    '[role="textbox"]',
    'div[contenteditable="true"]',
    // Last resort - any input that could be text
    'input[placeholder*="Describe" i]',
    'input[placeholder*="prompt" i]',
  ],

  // File upload for reference images
  referenceFileInput: 'input[type="file"][accept*="image"]',

  // Generate / Submit buttons
  generateButton: [
    'button:has-text("Generate")',
    'button:has-text("Create")',
    '[aria-label*="Generate" i]',
    'button[type="submit"]:not([disabled])',
    '[data-testid="generate-btn"]',
    'button:has-text("Run")',
  ],

  // Progress/loading indicators
  loadingIndicators: [
    '[aria-label="Generating"]',
    '[aria-label="Loading"]',
    '[data-testid="generating-spinner"]',
    ':text("Generating...")',
    ':text("Creating...")',
    ':text("Loading...")',
    '.loading-indicator',
    '[role="progressbar"]',
  ],

  // Error feedback
  errorBanner: [
    '[role="alert"]:not([aria-hidden="true"])',
    '.error-message',
    '[data-testid="error-banner"]',
    ':text("Something went wrong")',
    ':text("Error")',
  ],

  // Output media results
  resultImage: [
    // Generated image results (usually inside a result container)
    '[data-testid="generation-result"] img',
    '[data-testid="output-image"] img',
    '.result-grid img',
    '.generated-image img',
    // After generation, look for newly appeared images
    'img[src*="googleusercontent.com"]',
    'img[src*="blob:"]',
    'img[src*="lh3."]',
    // Generic fallback — images that aren't UI icons
    'img[width][height]:not([src*="icon"]):not([src*="logo"]):not([src*="favicon"])',
  ],
  resultVideo: [
    'video[src*="googleusercontent.com"]',
    'video[src*="blob:"]',
    '[data-testid="generation-result"] video',
    'video',
  ],

  // Download
  downloadButton: [
    'button:has-text("Download")',
    '[aria-label*="Download" i]',
    'a[download]',
    '[data-testid="download-btn"]',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Try multiple URLs and return the one that resolves to Flow UI
// ─────────────────────────────────────────────────────────────────────────────
async function navigateToFlow(page: Page, preferredUrl: string): Promise<string> {
  const urlsToTry = [
    preferredUrl,
    FLOW_URLS.primary,
    FLOW_URLS.fallback,
    FLOW_URLS.alternate,
  ].filter((u, i, a) => a.indexOf(u) === i); // deduplicate

  for (const url of urlsToTry) {
    try {
      console.log(`[FlowAdapter] Trying URL: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

      // Wait for page to stabilize after possible SPA redirects
      await Promise.race([
        page.waitForLoadState('networkidle', { timeout: 8000 }),
        page.waitForTimeout(4000),
      ]).catch(() => {});

      const finalUrl = page.url();
      console.log(`[FlowAdapter] Landed on: ${finalUrl}`);

      // If we hit accounts.google.com, this URL requires login — that's fine, continue
      // If we're on any google domain, accept it
      if (
        finalUrl.includes('google.com') ||
        finalUrl.includes('labs.google') ||
        finalUrl.includes('flow.google')
      ) {
        return finalUrl;
      }
    } catch (err: any) {
      console.warn(`[FlowAdapter] Failed to navigate to ${url}: ${err.message}`);
    }
  }
  return page.url();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Dismiss any modal/overlay dialogs
// ─────────────────────────────────────────────────────────────────────────────
async function dismissModals(page: Page): Promise<void> {
  for (const sel of FLOW_SELECTORS.modalDismissButtons) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Find first visible element matching any of the selectors
// ─────────────────────────────────────────────────────────────────────────────
async function findFirstVisible(page: Page, selectors: string[], timeout = 2000) {
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      if (await locator.isVisible({ timeout }).catch(() => false)) {
        return locator;
      }
    } catch {}
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if authentication is required
// ─────────────────────────────────────────────────────────────────────────────
async function isAuthRequired(page: Page): Promise<boolean> {
  try {
    // Check URL first — most reliable
    const currentUrl = page.url();
    if (
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('/signin') ||
      currentUrl.includes('ServiceLogin') ||
      currentUrl.includes('oauth') ||
      currentUrl.includes('login')
    ) {
      return true;
    }

    // Wait a moment for any redirect to settle
    await page.waitForTimeout(1000);
    const refreshedUrl = page.url();
    if (refreshedUrl !== currentUrl && (
      refreshedUrl.includes('accounts.google.com') ||
      refreshedUrl.includes('/signin')
    )) {
      return true;
    }

    // 1. Check if user is ALREADY logged in first (avatar, user chip, prompt input)
    for (const sel of FLOW_SELECTORS.userLoggedInIndicators) {
      try {
        const isVis = await page.locator(sel).first().isVisible({ timeout: 800 }).catch(() => false);
        if (isVis) return false;
      } catch {}
    }

    // 2. Check for sign-in buttons in DOM
    for (const sel of FLOW_SELECTORS.authRequiredIndicators) {
      try {
        const isVis = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false);
        if (isVis) return true;
      } catch {}
    }

    return false;
  } catch (err: any) {
    // If execution context was destroyed mid-check, it usually means navigation happened
    if (err.message?.includes('Execution context was destroyed') ||
        err.message?.includes('Target closed') ||
        err.message?.includes('Session closed')) {
      // Wait for page to stabilize and try URL check
      await page.waitForTimeout(2500).catch(() => {});
      try {
        const url = page.url();
        return url.includes('accounts.google.com') || url.includes('/signin');
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if quota is exhausted
// ─────────────────────────────────────────────────────────────────────────────
async function isQuotaExhausted(page: Page): Promise<boolean> {
  try {
    for (const sel of FLOW_SELECTORS.quotaExhaustedIndicators) {
      try {
        const isVis = await page.locator(sel).first().isVisible({ timeout: 800 }).catch(() => false);
        if (isVis) return true;
      } catch {}
    }
  } catch {}
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Wait for SPA to load prompt input — with increasing timeout
// ─────────────────────────────────────────────────────────────────────────────
async function waitForPromptInput(page: Page, maxWaitMs = 15000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    // Try each selector with a short timeout
    for (const sel of FLOW_SELECTORS.promptInput) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
          // Extra check: make sure it's actually interactable
          const isEnabled = await loc.isEnabled({ timeout: 500 }).catch(() => false);
          if (isEnabled) return loc;
        }
      } catch {}
    }
    await page.waitForTimeout(800);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADAPTER CLASS
// ─────────────────────────────────────────────────────────────────────────────
export class GoogleFlowAdapter implements FlowProvider {
  public name = 'Google Flow Adapter (Playwright)';
  private outputManager: OutputManager;
  private flowUrl: string;

  constructor(outputManager: OutputManager, flowUrl: string = FLOW_URLS.primary) {
    this.outputManager = outputManager;
    this.flowUrl = flowUrl;
  }

  public setFlowUrl(url: string) {
    this.flowUrl = url;
  }

  public async generate(
    job: Job,
    session: Session,
    onProgress: (progress: GenerationProgress) => void
  ): Promise<GenerationResult> {
    const projectName = (job.metadata?.projectName as string) || 'FlowStudioProject';
    const { imagesDir, videosDir } = this.outputManager.getProjectDirs(projectName);

    onProgress({ progress: 8, stage: 'starting', message: `Đang khởi động trình duyệt cho phiên [${session.name}]...` });

    let context: BrowserContext | null = null;
    try {
      // ── Launch browser with persistent session ──────────────────────────
      context = await chromium.launchPersistentContext(session.profileDir, {
        headless: false, // must be visible for Google anti-bot checks
        viewport: { width: 1280, height: 850 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      // ── Navigate to Google Flow ─────────────────────────────────────────
      onProgress({ progress: 15, stage: 'starting', message: 'Đang đi đến Google Flow...' });
      const landedUrl = await navigateToFlow(page, this.flowUrl);
      console.log(`[FlowAdapter] Navigation landed at: ${landedUrl}`);

      // Wait for dynamic content to render
      await page.waitForTimeout(2000);

      // ── Handle redirects to marketing/landing page ──────────────────────
      const currentUrl = page.url();
      const onLandingPage =
        currentUrl.includes('/about') ||
        currentUrl === 'https://flow.google.com/' ||
        currentUrl === 'https://labs.google/fx' ||
        currentUrl === 'https://labs.google/fx/' ||
        currentUrl.endsWith('/fx/tools');

      if (onLandingPage) {
        onProgress({ progress: 20, stage: 'starting', message: 'Đang vào studio từ trang đích...' });
        const enterBtn = await findFirstVisible(page, FLOW_SELECTORS.enterStudioButtons, 3000);
        if (enterBtn) {
          await enterBtn.click({ timeout: 5000 }).catch(() => {});
          await Promise.race([
            page.waitForLoadState('networkidle', { timeout: 8000 }),
            page.waitForTimeout(5000),
          ]).catch(() => {});
          await page.waitForTimeout(2000);
        }
      }

      // ── Dismiss any onboarding or consent modals ────────────────────────
      await dismissModals(page);

      // ── Check auth state ────────────────────────────────────────────────
      onProgress({ progress: 25, stage: 'starting', message: 'Đang xác minh phiên đăng nhập...' });
      const authRequired = await isAuthRequired(page);
      if (authRequired) {
        return {
          success: false,
          isAuthRequired: true,
          error: `Google Flow yêu cầu xác thực cho phiên "${session.name}". Vui lòng mở tab Phiên → "Mở trình duyệt (Đăng nhập)" và đăng nhập tài khoản Google của bạn.`,
        };
      }

      // ── Handle project dashboard (may need to open/create a project) ─────
      const newProjBtn = await findFirstVisible(page, FLOW_SELECTORS.newProjectButtons, 2000);
      if (newProjBtn) {
        onProgress({ progress: 30, stage: 'starting', message: 'Đang mở không gian làm việc...' });
        await newProjBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissModals(page);
      }

      // ── Check quota state ────────────────────────────────────────────────
      const quotaExhausted = await isQuotaExhausted(page);
      if (quotaExhausted) {
        return {
          success: false,
          isQuotaExhausted: true,
          error: `Quota Google Flow đã hết cho phiên "${session.name}". Tài khoản này đã đạt giới hạn tạo nội dung.`,
        };
      }

      // ── Select generation mode (Image/Video) ─────────────────────────────
      onProgress({ progress: 35, stage: 'submitting', message: `Đang chuyển sang chế độ ${job.type === 'image' ? 'ảnh' : 'video'}...` });
      await this.selectMode(page, job.type);
      await page.waitForTimeout(1000);

      // ── Wait for prompt input to appear (SPA may take time to render) ────
      onProgress({ progress: 45, stage: 'submitting', message: 'Đang đợi ô nhập prompt tải...' });
      const promptField = await waitForPromptInput(page, 15000);

      if (!promptField) {
        // Debug info: capture the current URL and title to help diagnose
        const debugUrl = page.url();
        const debugTitle = await page.title().catch(() => 'unknown');
        const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '').catch(() => '');
        console.error(`[FlowAdapter] Prompt input not found. URL: ${debugUrl}, Title: ${debugTitle}`);
        console.error(`[FlowAdapter] Page body snippet: ${pageText}`);

        return {
          success: false,
          error: `Không tìm thấy ô nhập prompt trên Google Flow. URL hiện tại: ${debugUrl} (${debugTitle}). Trang có thể cần tương tác thủ công. Vui lòng mở trình duyệt qua tab Phiên → "Mở trình duyệt (Đăng nhập)" để xác thực truy cập.`,
        };
      }

      // ── Attach reference image if provided ──────────────────────────────
      if (job.referenceImageUrl && fs.existsSync(job.referenceImageUrl)) {
        onProgress({ progress: 50, stage: 'submitting', message: 'Đang đính kèm ảnh tham chiếu...' });
        try {
          const fileInput = page.locator(FLOW_SELECTORS.referenceFileInput).first();
          if ((await fileInput.count()) > 0) {
            await fileInput.setInputFiles(job.referenceImageUrl);
            await page.waitForTimeout(500);
          }
        } catch (e) {
          console.warn('[FlowAdapter] Could not attach reference image:', e);
        }
      }

      // ── Enter the prompt ─────────────────────────────────────────────────
      onProgress({ progress: 55, stage: 'submitting', message: 'Đang nhập prompt...' });
      await promptField.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      // Use triple-click to select all then type (works for both textarea and contenteditable)
      await promptField.click({ clickCount: 3 });
      await promptField.fill('').catch(() => {}); // clear first
      await promptField.type(job.prompt, { delay: 20 });
      await page.waitForTimeout(500);

      // ── Submit generation ────────────────────────────────────────────────
      onProgress({ progress: 65, stage: 'generating', message: 'Đang gửi yêu cầu tạo...' });
      const generateBtn = await findFirstVisible(page, FLOW_SELECTORS.generateButton, 5000);
      if (!generateBtn) {
        return {
          success: false,
          error: 'Không tìm thấy nút Tạo trên Google Flow. Giao diện có thể đã thay đổi.',
        };
      }

      await generateBtn.click({ timeout: 5000 });

      // ── Monitor generation progress ──────────────────────────────────────
      onProgress({ progress: 75, stage: 'generating', message: 'Đang chờ Google Flow tạo nội dung...' });
      const generationResult = await this.waitForGeneration(page, job.type);
      if (!generationResult.success) {
        return generationResult;
      }

      // ── Download output ───────────────────────────────────────────────────
      onProgress({ progress: 90, stage: 'downloading', message: 'Đang tải về media đã tạo...' });
      const targetDir = job.type === 'image' ? imagesDir : videosDir;
      const downloadResult = await this.downloadResult(page, job, targetDir);

      if (!downloadResult.success || !downloadResult.outputFile) {
        return {
          success: false,
          error: downloadResult.error || 'Tải xuống đầu ra từ Google Flow thất bại.',
        };
      }

      // ── Save metadata ─────────────────────────────────────────────────────
      this.outputManager.saveMetadata(job, downloadResult.outputFile, projectName);

      onProgress({ progress: 100, stage: 'completed', message: 'Tạo nội dung hoàn tất!' });

      return {
        success: true,
        outputFile: downloadResult.outputFile,
        thumbnailFile: downloadResult.thumbnailFile,
        metadata: {
          engine: 'Google Flow Playwright Adapter',
          finalUrl: page.url(),
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      console.error('[FlowAdapter] Unhandled error during generation:', err);
      return {
        success: false,
        isTransient: true,
        error: `Lỗi tự động hóa trình duyệt: ${err.message || String(err)}`,
      };
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {}
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Select Image or Video mode
  // ──────────────────────────────────────────────────────────────────────────
  private async selectMode(page: Page, type: 'image' | 'video') {
    const selectors = type === 'image' ? FLOW_SELECTORS.modeSwitcher.image : FLOW_SELECTORS.modeSwitcher.video;
    const btn = await findFirstVisible(page, selectors, 3000);
    if (btn) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Wait for generation to complete — polls up to 3 minutes
  // ──────────────────────────────────────────────────────────────────────────
  private async waitForGeneration(page: Page, type: 'image' | 'video'): Promise<GenerationResult> {
    const startTime = Date.now();
    const timeoutMs = 180000; // 3 minutes
    const resultSelectors = type === 'image' ? FLOW_SELECTORS.resultImage : FLOW_SELECTORS.resultVideo;

    // First, wait briefly for loading indicator to appear (confirming generation started)
    let generationStarted = false;
    for (let i = 0; i < 10; i++) {
      for (const sel of FLOW_SELECTORS.loadingIndicators) {
        try {
          if (await page.locator(sel).first().isVisible({ timeout: 500 }).catch(() => false)) {
            generationStarted = true;
            break;
          }
        } catch {}
      }
      if (generationStarted) break;
      await page.waitForTimeout(500);
    }

    // Poll for completion
    while (Date.now() - startTime < timeoutMs) {
      // Check quota
      if (await isQuotaExhausted(page)) {
        return {
          success: false,
          isQuotaExhausted: true,
          error: 'Đã đạt giới hạn quota trong quá trình tạo.',
        };
      }

      // Check auth (page might have been redirected)
      if (await isAuthRequired(page)) {
        return {
          success: false,
          isAuthRequired: true,
          error: 'Phiên hết hạn trong quá trình tạo. Vui lòng xác thực lại.',
        };
      }

      // Check for error alerts
      for (const errSel of FLOW_SELECTORS.errorBanner) {
        try {
          const errLoc = page.locator(errSel).first();
          if (await errLoc.isVisible({ timeout: 400 }).catch(() => false)) {
            const text = (await errLoc.textContent().catch(() => '')) || 'Lỗi không xác định';
            // Ignore common false-positive alerts (e.g., cookie notices)
            if (text.length < 300 && !text.toLowerCase().includes('cookie')) {
              return {
                success: false,
                error: `Google Flow báo lỗi: ${text.trim().slice(0, 200)}`,
              };
            }
          }
        } catch {}
      }

      // Check if result is present
      for (const sel of resultSelectors) {
        try {
          const resLoc = page.locator(sel).first();
          if (await resLoc.isVisible({ timeout: 400 }).catch(() => false)) {
            // Make sure loading indicators are gone (generation truly done)
            let stillLoading = false;
            for (const loadSel of FLOW_SELECTORS.loadingIndicators) {
              if (await page.locator(loadSel).first().isVisible({ timeout: 300 }).catch(() => false)) {
                stillLoading = true;
                break;
              }
            }
            if (!stillLoading) {
              return { success: true };
            }
          }
        } catch {}
      }

      await page.waitForTimeout(1500);
    }

    return {
      success: false,
      error: 'Tạo nội dung hết thời gian sau 3 phút. Vui lòng kiểm tra Google Flow thủ công.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Download the generated result
  // ──────────────────────────────────────────────────────────────────────────
  private async downloadResult(
    page: Page,
    job: Job,
    targetDir: string
  ): Promise<{ success: boolean; outputFile?: string; thumbnailFile?: string; error?: string }> {
    const ext = job.type === 'image' ? 'png' : 'mp4';
    const filePath = path.join(targetDir, `${job.id}.${ext}`);

    // Strategy 1: Click download button and capture download event
    for (const sel of FLOW_SELECTORS.downloadButton) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 20000 }),
            btn.click(),
          ]);
          await download.saveAs(filePath);
          return { success: true, outputFile: filePath };
        }
      } catch {}
    }

    // Strategy 2: Screenshot result image element
    if (job.type === 'image') {
      const resultSelectors = FLOW_SELECTORS.resultImage;
      for (const sel of resultSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
            await loc.screenshot({ path: filePath });
            return { success: true, outputFile: filePath };
          }
        } catch {}
      }
    }

    // Strategy 3: For video, grab src attribute and download via fetch
    if (job.type === 'video') {
      for (const sel of FLOW_SELECTORS.resultVideo) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
            const src = await loc.getAttribute('src').catch(() => null);
            if (src && src.startsWith('http')) {
              // Download via page evaluate (has access to cookies/auth)
              const saved = await page.evaluate(
                async ({ url, fp }: { url: string; fp: string }) => {
                  try {
                    const res = await fetch(url, { credentials: 'include' });
                    if (!res.ok) return false;
                    const blob = await res.blob();
                    // Return base64 to transfer
                    const reader = new FileReader();
                    return await new Promise<string>((resolve) => {
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  } catch {
                    return false;
                  }
                },
                { url: src, fp: filePath }
              );

              if (saved && typeof saved === 'string' && saved.startsWith('data:')) {
                const base64Data = saved.split(',')[1];
                fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                // Capture thumbnail
                const thumbPath = filePath.replace('.mp4', '_thumb.png');
                await loc.screenshot({ path: thumbPath }).catch(() => {});
                return { success: true, outputFile: filePath, thumbnailFile: thumbPath };
              }
            }
            // Fallback: just screenshot the video frame as thumbnail, mark incomplete
            const thumbPath = filePath.replace('.mp4', '_thumb.png');
            await loc.screenshot({ path: thumbPath }).catch(() => {});
            return { success: false, error: 'Không thể tải trực tiếp luồng video. Hãy thử nút tải thủ công.' };
          }
        } catch {}
      }
    }

    return {
      success: false,
      error: 'Không tìm thấy kết quả có thể tải trên Google Flow. Quá trình tạo có thể chưa hoàn tất.',
    };
  }
}
