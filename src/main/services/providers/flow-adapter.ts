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
  // Authentication indicators (when sign in is needed)
  authRequiredIndicators: [
    'a[href*="accounts.google.com/signin"]',
    'a[href*="accounts.google.com/ServiceLogin"]',
    'a[href*="accounts.google.com/InteractiveLogin"]',
    'a[href*="accounts.google.com"]',
    'button:has-text("Sign in")',
    'button:has-text("Sign In")',
    'button:has-text("Log in")',
    'button:has-text("Đăng nhập")',
    'a:has-text("Sign in")',
    'a:has-text("Đăng nhập")',
    '[aria-label*="Sign in" i]',
    '[aria-label*="Đăng nhập" i]',
    '.gb_6a',
    '#gb a[href*="ServiceLogin"]',
  ],
  userLoggedInIndicators: [
    'header img[src*="googleusercontent"]',
    '#gb img[src*="googleusercontent"]',
    'img[src*="googleusercontent"]',
    'img[src*="lh3.googleusercontent"]',
    'img[alt*="Google Account" i]',
    'img[alt*="Tài khoản Google" i]',
    '[aria-label*="Google Account" i]',
    '[aria-label*="Tài khoản Google" i]',
    'button[aria-label*="Account" i]',
    'button[aria-label*="Tài khoản" i]',
    '[data-testid="user-avatar"]',
    'a[href*="SignOutOptions"]',
    'a[href*="/project/"]',
    'button:has-text("New project")',
    'button:has-text("New Project")',
    'button:has-text("Dự án mới")',
    '[data-testid="new-project-btn"]',
  ],
  quotaExhaustedIndicators: [
    ':text("quota exceeded")',
    ':text("reached your limit")',
    ':text("Out of credits")',
    ':text("Daily limit reached")',
    ':text("usage limit")',
    ':text("try again tomorrow")',
    ':text("Hết hạn ngạch")',
    ':text("đã đạt giới hạn")',
    '[data-testid="quota-exhausted"]',
  ],

  // Studio entry — marketing or landing page
  enterStudioButtons: [
    'button:has-text("Create with Google Flow")',
    'button:has-text("Tạo bằng Google Flow")',
    'a:has-text("Create with Google Flow")',
    'a:has-text("Tạo bằng Google Flow")',
    'button:has-text("Try in Google Flow")',
    'button:has-text("Thử trong Google Flow")',
    'a:has-text("Try in Google Flow")',
    'a:has-text("Thử trong Google Flow")',
    'button:has-text("Get started")',
    'button:has-text("Bắt đầu")',
    'button:has-text("Try Flow")',
    'button:has-text("Thử Flow")',
    'a:has-text("Get started")',
    'a:has-text("Bắt đầu")',
    'a[href*="/fx/tools/flow"]',
    'a[href="/flow"]',
  ],

  // Dismiss disclaimers / onboarding modals
  modalDismissButtons: [
    'button:has-text("I agree")',
    'button:has-text("Tôi đồng ý")',
    'button:has-text("Agree")',
    'button:has-text("Đồng ý")',
    'button:has-text("Accept")',
    'button:has-text("Chấp nhận")',
    'button:has-text("Got it")',
    'button:has-text("Đã hiểu")',
    'button:has-text("Continue")',
    'button:has-text("Tiếp tục")',
    'button:has-text("Dismiss")',
    'button:has-text("Bỏ qua")',
    'button:has-text("Đóng")',
    '[role="dialog"] button:has-text("Close")',
    '[aria-label="Close dialog"]',
    '[aria-label="Dismiss"]',
  ],

  // NEW PROJECT / Project dashboard
  newProjectButtons: [
    'button:has-text("New Project")',
    'button:has-text("New project")',
    'button:has-text("Create project")',
    'button:has-text("Dự án mới")',
    'button:has-text("Tạo dự án")',
    'button:has-text("Tạo dự án mới")',
    'button:has-text("+ Dự án mới")',
    'button:has-text("+")',
    '[aria-label*="New project" i]',
    '[aria-label*="Dự án mới" i]',
    '[aria-label*="Tạo dự án" i]',
    '[data-testid="new-project-btn"]',
  ],

  // Mode / Tab switchers — Image vs Video
  modeSwitcher: {
    image: [
      'button:has-text("Image")',
      'button:has-text("Hình ảnh")',
      'button:has-text("Ảnh")',
      '[data-tab="image"]',
      '[aria-label="Image"]',
      '[aria-label="Hình ảnh"]',
      'button:has-text("Nano Banana")',
      'button[data-mode="image"]',
      '[role="tab"]:has-text("Image")',
      '[role="tab"]:has-text("Hình ảnh")',
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
  promptInput: [
    'div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror',
    'div[aria-label="Bạn muốn tạo những gì?"]',
    'div[contenteditable="true"][aria-label*="tạo" i]',
    'div[contenteditable="true"][role="textbox"]',
    // Specific attribute-based selectors (English & Vietnamese)
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="describe" i]',
    'textarea[aria-label*="Mô tả" i]',
    'textarea[aria-label*="lời nhắc" i]',
    'textarea[placeholder*="Describe" i]',
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="imagine" i]',
    'textarea[placeholder*="Write" i]',
    'textarea[placeholder*="Enter" i]',
    'textarea[placeholder*="Mô tả" i]',
    'textarea[placeholder*="lời nhắc" i]',
    'textarea[placeholder*="nhập" i]',
    '[role="textbox"][aria-label*="prompt" i]',
    '[role="textbox"][aria-label*="describe" i]',
    '[role="textbox"][aria-label*="Mô tả" i]',
    // ContentEditable divs used by many modern SPAs
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'div[contenteditable="true"][aria-label*="describe" i]',
    'div[contenteditable="true"][aria-label*="Mô tả" i]',
    'div[contenteditable="true"][aria-label*="lời nhắc" i]',
    'div[contenteditable="true"][aria-multiline="true"]',
    // Generic fallbacks inside project workspace
    'textarea:not([readonly])',
    '[role="textbox"]',
    'div[contenteditable="true"]',
    // Last resort - any input that could be text
    'input[placeholder*="Describe" i]',
    'input[placeholder*="prompt" i]',
    'input[placeholder*="Mô tả" i]',
  ],

  // File upload for reference images
  referenceFileInput: 'input[type="file"][accept*="image"]',

  // Generate / Submit buttons
  generateButton: [
    'button.generate-icon-button',
    'button[aria-label="Bắt đầu tạo"]',
    'button[aria-label*="bắt đầu tạo" i]',
    'button:has(i:has-text("arrow_forward"))',
    'button:has(span:has-text("arrow_forward"))',
    'button:has-text("Generate")',
    'button:has-text("Tạo")',
    'button:has-text("Chạy")',
    'button:has-text("Create")',
    '[aria-label*="Generate" i]',
    '[aria-label*="Tạo" i]',
    'button[type="submit"]:not([disabled])',
    '[data-testid="generate-btn"]',
    'button:has-text("Run")',
  ],

  // Progress/loading indicators shown while generation is in-queue or processing
  loadingIndicators: [
    '.tile-row:has-text("%")',
    '.virtual-item-container:has-text("%")',
    'div:has-text("%")',
    'mat-progress-bar',
    '.mat-mdc-progress-bar',
    '[role="progressbar"]',
    '[aria-label="Generating"]',
    '[aria-label="Đang tạo"]',
    '[aria-label="Loading"]',
    '[data-testid="generating-spinner"]',
    ':text("Generating...")',
    ':text("Đang tạo...")',
    ':text("Creating...")',
    ':text("Loading...")',
    ':text("In queue")',
    ':text("Đang chờ")',
    ':text("Processing")',
    ':text("Đang xử lý")',
    '.loading-indicator',
    '[data-testid="skeleton"]',
    '.skeleton',
  ],

  // Error feedback
  errorBanner: [
    '[role="alert"]:not([aria-hidden="true"])',
    '.error-message',
    '[data-testid="error-banner"]',
    ':text("Something went wrong")',
    ':text("Error")',
  ],

  // Result cards in gallery / queue view after generation
  resultCard: [
    '.tile-row',
    '.virtual-item-container',
    '[data-testid="generation-result"]',
    '[data-testid="result-card"]',
    '[data-testid="output-card"]',
    '.result-card',
    '.generation-card',
    '.output-card',
    '[data-generation-id]',
    '[data-result-id]',
    '.grid-item:has(img)',
    '.gallery-item:has(img)',
    'li:has(img[src*="googleusercontent"])',
    'div:has(> img[src*="googleusercontent"])',
  ],

  // Output media results (strictly excluding avatars and UI elements)
  resultImage: [
    'img[src*="/asb/"]',
    'img.image[src*="flow.google.com"]',
    'img[alt*="hiển thị hình ảnh" i]',
    'img[alt*="hình ảnh của người dùng" i]',
    '.tile-row img',
    '.virtual-item-container img',
    '[data-testid="generation-result"] img:not([src*="/a/"]):not([src*="avatar"])',
    '[data-testid="output-image"] img:not([src*="/a/"]):not([src*="avatar"])',
    '.result-grid img:not([src*="/a/"]):not([src*="avatar"])',
    '.generated-image img:not([src*="/a/"]):not([src*="avatar"])',
    '[data-generation-id] img:not([src*="/a/"]):not([src*="avatar"])',
    'main img:not([src*="/a/"]):not([src*="avatar"]):not([aria-label*="account" i])',
    '[role="main"] img:not([src*="/a/"]):not([src*="avatar"]):not([aria-label*="account" i])',
    '.gallery-item img:not([src*="/a/"]):not([src*="avatar"])',
  ],
  resultVideo: [
    'main video',
    '[role="main"] video',
    '[data-testid="generation-result"] video',
    'video[src*="blob:"]',
    'video[src*="googleusercontent.com"]',
  ],

  // Download
  downloadButton: [
    'button:has-text("Download")',
    'button:has-text("Tải xuống")',
    'button:has-text("Tải về")',
    '[aria-label*="Download" i]',
    '[aria-label*="Tải xuống" i]',
    '[aria-label*="Tải về" i]',
    '[title*="Download" i]',
    '[title*="Tải xuống" i]',
    '[title*="Tải về" i]',
    'a[download]',
    '[data-testid*="download" i]',
    'button:has(svg path[d*="M19 9h-4V3H9v6H5l7 7 7-7z"])',
    'button:has(svg path[d*="M5 20h14v-2H5v2z"])',
    '[role="menuitem"]:has-text("Download")',
    '[role="menuitem"]:has-text("Tải xuống")',
    '[role="menuitem"]:has-text("Tải về")',
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
export async function isAuthRequired(page: Page): Promise<boolean> {
  try {
    // Check URL first — most reliable
    const currentUrl = page.url();
    if (
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('/signin') ||
      currentUrl.includes('ServiceLogin') ||
      currentUrl.includes('InteractiveLogin') ||
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
      refreshedUrl.includes('/signin') ||
      refreshedUrl.includes('ServiceLogin')
    )) {
      return true;
    }

    // 1. Deep check via page.evaluate for presence of login links vs user account elements
    const domAuthStatus = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a, button, img'));
      let hasSignIn = false;
      let hasUserAvatar = false;

      for (const el of anchors) {
        const href = ((el as HTMLAnchorElement).href || '').toLowerCase();
        const src = ((el as HTMLImageElement).src || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const alt = (el.getAttribute('alt') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();

        // Sign in signals
        if (
          href.includes('accounts.google.com') ||
          href.includes('servicelogin') ||
          text === 'sign in' || text === 'đăng nhập' ||
          aria.includes('sign in') || aria.includes('đăng nhập')
        ) {
          hasSignIn = true;
        }

        // Logged in signals
        if (
          href.includes('signoutoptions') ||
          aria.includes('google account') || aria.includes('tài khoản google') ||
          alt.includes('google account') || alt.includes('tài khoản google') ||
          (src.includes('googleusercontent.com') && !src.includes('default_avatar'))
        ) {
          hasUserAvatar = true;
        }
      }

      return { hasSignIn, hasUserAvatar };
    }).catch(() => null);

    if (domAuthStatus) {
      if (domAuthStatus.hasUserAvatar) return false;
      if (domAuthStatus.hasSignIn) return true;
    }

    // 2. Fallback check for user logged in indicators via Playwright selectors
    for (const sel of FLOW_SELECTORS.userLoggedInIndicators) {
      try {
        const isVis = await page.locator(sel).first().isVisible({ timeout: 800 }).catch(() => false);
        if (isVis) return false;
      } catch {}
    }

    // 3. Fallback check for sign-in buttons in DOM via Playwright locators
    for (const sel of FLOW_SELECTORS.authRequiredIndicators) {
      try {
        const isVis = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false);
        if (isVis) return true;
      } catch {}
    }

    // If on base flow.google.com landing page with no project links and no user avatar
    if (page.url() === 'https://flow.google.com/' || page.url() === 'https://flow.google.com') {
      const hasProject = await page.locator('a[href*="/project/"]').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (!hasProject) {
        return true;
      }
    }

    return false;
  } catch (err: any) {
    if (err.message?.includes('Execution context was destroyed') ||
        err.message?.includes('Target closed') ||
        err.message?.includes('Session closed')) {
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

export interface MediaSnapshot {
  urls: string[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Snapshot LARGE result media on page (strictly filters out avatars/icons)
// ─────────────────────────────────────────────────────────────────────────────
export async function getMediaSnapshot(page: Page): Promise<MediaSnapshot> {
  try {
    return await page.evaluate(() => {
      const isAvatarOrUI = (el: Element): boolean => {
        if (el.closest('header, nav, [role="banner"], [aria-label*="Google Account" i], [aria-label*="Tài khoản Google" i], [data-testid*="avatar" i], .gb_')) {
          return true;
        }
        const src = (el.getAttribute('src') || '').toLowerCase();
        if (
          src.includes('/a/acg8oc') ||
          src.includes('default_avatar') ||
          src.includes('ogw/af2b') ||
          src.includes('=s32') ||
          src.includes('=s48') ||
          src.includes('=s64') ||
          src.includes('=s96') ||
          src.includes('=s128')
        ) {
          return true;
        }
        const alt = (el.getAttribute('alt') || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (alt.includes('account') || alt.includes('tài khoản') || aria.includes('account') || aria.includes('tài khoản')) {
          return true;
        }
        return false;
      };

      const urls = new Set<string>();
      const imgs = Array.from(document.querySelectorAll('img'));
      imgs.forEach((img) => {
        if (isAvatarOrUI(img)) return;
        const rect = img.getBoundingClientRect();
        const isFlowMedia = img.src && (img.src.includes('/asb/') || img.classList.contains('image'));
        if (isFlowMedia || (rect.width >= 150 && rect.height >= 150) || (img.naturalWidth >= 150 && img.naturalHeight >= 150)) {
          if (img.src) urls.add(img.src);
        }
      });

      const videos = Array.from(document.querySelectorAll('video'));
      videos.forEach((v) => {
        if (isAvatarOrUI(v)) return;
        if (v.src) urls.add(v.src);
        v.querySelectorAll('source').forEach((s) => {
          if (s.src) urls.add(s.src);
        });
      });

      const urlList = Array.from(urls);
      return { urls: urlList, count: urlList.length };
    });
  } catch {
    return { urls: [], count: 0 };
  }
}

async function countExistingResults(page: Page): Promise<number> {
  const snapshot = await getMediaSnapshot(page);
  return snapshot.count;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if page is showing a queue/gallery view after generation submit
// ─────────────────────────────────────────────────────────────────────────────
async function isInGalleryOrQueueView(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    // URL patterns that indicate we are in gallery/result view
    if (url.includes('/gallery') || url.includes('/results') || url.includes('/queue')) {
      return true;
    }
    // Check for loading skeleton or queue indicators
    for (const sel of FLOW_SELECTORS.loadingIndicators) {
      try {
        if (await page.locator(sel).first().isVisible({ timeout: 400 }).catch(() => false)) {
          return true;
        }
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
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
          error: `Google Flow yêu cầu đăng nhập cho phiên "${session.name}". Vui lòng mở tab Phiên → bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập tài khoản Google của bạn.`,
        };
      }

      // ── Handle project dashboard (open or create a project workspace) ─────
      if (!page.url().includes('/project/')) {
        onProgress({ progress: 30, stage: 'starting', message: 'Đang mở không gian làm việc...' });
        const newProjBtn = await findFirstVisible(page, FLOW_SELECTORS.newProjectButtons, 3000);
        if (newProjBtn) {
          await newProjBtn.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(3000);
          await dismissModals(page);
        } else {
          // Check for existing project cards / links
          const existingProj = page.locator('a[href*="/project/"]').first();
          if (await existingProj.isVisible({ timeout: 2000 }).catch(() => false)) {
            await existingProj.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(3000);
            await dismissModals(page);
          }
        }
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
        const authCheck = await isAuthRequired(page);

        console.error(`[FlowAdapter] Prompt input not found. URL: ${debugUrl}, Title: ${debugTitle}, AuthCheck: ${authCheck}`);

        // If not inside a project workspace or auth is required, treat as auth_required so queue stops safely
        if (authCheck || !debugUrl.includes('/project/')) {
          return {
            success: false,
            isAuthRequired: true,
            error: `Phiên "${session.name}" chưa đăng nhập Google Flow hoặc chưa vào dự án. URL: ${debugUrl} (${debugTitle}). Vui lòng vào tab Phiên → bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập Google trước khi chạy.`,
          };
        }

        return {
          success: false,
          error: `Không tìm thấy ô nhập prompt trên Google Flow. URL hiện tại: ${debugUrl} (${debugTitle}). Giao diện có thể đã cập nhật hoặc trang cần thao tác thủ công.`,
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

      // ── Configure repeat multiplier (x1, x2, x3, x4) and aspect ratio ─────
      if (job.type === 'image') {
        const targetRepeat = (job.metadata?.repeatCount as number) || 1;
        onProgress({ progress: 52, stage: 'submitting', message: `Đang cấu hình số lượng ảnh (x${targetRepeat}) & tỷ lệ (${job.aspectRatio || '16:9'})...` });
        await this.configureSettings(page, targetRepeat, job.aspectRatio);
      }

      // ── Enter the prompt ─────────────────────────────────────────────────
      onProgress({ progress: 55, stage: 'submitting', message: 'Đang nhập prompt...' });
      await promptField.click({ timeout: 5000 });
      await page.waitForTimeout(200);
      // Select all existing text and delete it
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(100);

      // Typing via keyboard.insertText creates native ProseMirror transaction
      await page.keyboard.insertText(job.prompt);
      await page.waitForTimeout(500);

      // Trigger change/input event fallbacks
      await promptField.dispatchEvent('input').catch(() => {});
      await promptField.dispatchEvent('change').catch(() => {});
      await page.waitForTimeout(400);

      // ── Submit generation ────────────────────────────────────────────────
      onProgress({ progress: 65, stage: 'generating', message: 'Đang gửi yêu cầu tạo...' });
      const generateBtn = await findFirstVisible(page, FLOW_SELECTORS.generateButton, 5000);
      if (!generateBtn) {
        return {
          success: false,
          error: 'Không tìm thấy nút Tạo trên Google Flow. Giao diện có thể đã thay đổi.',
        };
      }

      // Wait up to 4s for Angular to remove disabled class after input
      for (let w = 0; w < 10; w++) {
        const isDisabled = await generateBtn.evaluate((b: HTMLButtonElement) => {
          return b.disabled || b.classList.contains('mat-mdc-button-disabled') || b.getAttribute('aria-disabled') === 'true';
        }).catch(() => false);
        if (!isDisabled) break;
        await page.waitForTimeout(400);
      }

      // Record baseline media snapshot before clicking generate
      const preSnapshot = await getMediaSnapshot(page);
      const preGenerateUrl = page.url();
      console.log(`[FlowAdapter] Pre-generate: ${preSnapshot.count} existing results, URL: ${preGenerateUrl}`);

      await generateBtn.click({ timeout: 5000 });
      // Short wait for page to react to click (may navigate or show queue)
      await page.waitForTimeout(2000);

      const postClickUrl = page.url();
      console.log(`[FlowAdapter] Post-click URL: ${postClickUrl}`);

      // ── Monitor generation progress ──────────────────────────────────────
      onProgress({ progress: 75, stage: 'generating', message: 'Đang chờ Google Flow tạo nội dung...' });
      const generationResult = await this.waitForGeneration(page, job.type, preSnapshot, onProgress);
      if (!generationResult.success) {
        return generationResult;
      }

      // ── Download output ───────────────────────────────────────────────────
      onProgress({ progress: 90, stage: 'downloading', message: 'Đang tải về media đã tạo...' });
      const targetDir = job.type === 'image' ? imagesDir : videosDir;
      const downloadResult = await this.downloadResult(page, job, targetDir, preSnapshot);

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
      const isClosed =
        err.message?.includes('Target page, context or browser has been closed') ||
        err.message?.includes('Target closed') ||
        err.message?.includes('Session closed');

      return {
        success: false,
        isTransient: !isClosed,
        error: isClosed
          ? 'Cửa sổ trình duyệt Chromium đã bị đóng trong lúc thực hiện tác vụ tự động. Vui lòng giữ cửa sổ mở trong suốt quá trình xử lý.'
          : `Lỗi tự động hóa trình duyệt: ${err.message || String(err)}`,
      };
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {}
        // Allow OS time to release file locks on Windows
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
  // Configure repeat multiplier (x1, x2, x3, x4) and aspect ratio (16:9, 1:1, etc.)
  // Defaults to x1 so users do not waste credits on Google Flow's default x2!
  // ──────────────────────────────────────────────────────────────────────────
  private async configureSettings(
    page: Page,
    repeatCount: number = 1,
    aspectRatio?: string
  ): Promise<void> {
    try {
      const trigger = page.locator('.settings-trigger-button, button:has-text("Nano Banana"), button:has-text("x1"), button:has-text("x2"), button:has-text("x3"), button:has-text("x4")').first();
      const isVis = await trigger.isVisible({ timeout: 2500 }).catch(() => false);
      if (!isVis) {
        console.log('[FlowAdapter] Settings trigger button not visible, skipping settings config');
        return;
      }

      const currentText = (await trigger.innerText().catch(() => '')).trim();
      const targetRepeatStr = `x${repeatCount}`;
      const needsRepeatChange = !currentText.includes(targetRepeatStr);
      const needsAspectChange = aspectRatio ? !currentText.includes(aspectRatio) : false;

      // If already matching target repeat and aspect, no need to open
      if (!needsRepeatChange && !needsAspectChange) {
        console.log(`[FlowAdapter] Settings already match: repeat=${targetRepeatStr}, aspect=${aspectRatio || 'current'}`);
        return;
      }

      console.log(`[FlowAdapter] Opening settings popup to set repeat=${targetRepeatStr}, aspect=${aspectRatio || 'keep'} (current: "${currentText.replace(/\n/g, ' ')}")...`);
      await trigger.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);

      // Select repeat toggle (x1, x2, x3, x4)
      const repeatToggle = page.locator(`mat-button-toggle:has-text("${targetRepeatStr}"), button[role="radio"]:has-text("${targetRepeatStr}")`).first();
      if (await repeatToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await repeatToggle.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Select aspect ratio toggle (16:9, 1:1, 9:16, 4:3, 3:4)
      if (aspectRatio) {
        const aspectToggle = page.locator(`mat-button-toggle:has-text("${aspectRatio}"), button[role="radio"]:has-text("${aspectRatio}")`).first();
        if (await aspectToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
          await aspectToggle.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
      }

      // Close settings popup with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      const afterText = (await trigger.innerText().catch(() => '')).trim();
      console.log(`[FlowAdapter] Settings configured successfully. Trigger button now shows: "${afterText.replace(/\n/g, ' ')}"`);
    } catch (err: any) {
      console.warn(`[FlowAdapter] Warning: Could not configure settings: ${err.message}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Wait for generation to complete — polls up to 5 minutes
  // Handles Google Flow's async queue: after clicking "Tạo", the UI may
  // navigate to a gallery/queue view. We detect NEW results appearing.
  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // Wait for generation to complete — polls up to 5 minutes
  // Handles Google Flow's async queue: detects genuine NEW results
  // ──────────────────────────────────────────────────────────────────────────
  private async waitForGeneration(
    page: Page,
    type: 'image' | 'video',
    baseline: MediaSnapshot,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const timeoutMs = 300000; // 5 minutes max
    const minGenerationTimeMs = 5000; // AI image/video generation is never instant (< 5s)

    // Phase 1: Wait up to 15s to observe generation START
    let generationStarted = false;
    const startWaitMs = Date.now();

    while (Date.now() - startWaitMs < 15000) {
      for (const sel of FLOW_SELECTORS.loadingIndicators) {
        try {
          if (await page.locator(sel).first().isVisible({ timeout: 400 }).catch(() => false)) {
            generationStarted = true;
            console.log(`[FlowAdapter] Generation started signal detected via: ${sel}`);
            break;
          }
        } catch {}
      }

      // Check if generate button is disabled or aria-busy (common while processing)
      const isGenerateDisabled = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const genBtn = btns.find((b) => {
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'generate' || t === 'tạo' || t === 'chạy';
        });
        return genBtn ? (genBtn.disabled || genBtn.getAttribute('aria-busy') === 'true') : false;
      }).catch(() => false);

      if (isGenerateDisabled) {
        generationStarted = true;
      }

      // Check if new results appeared
      const current = await getMediaSnapshot(page);
      const newUrls = current.urls.filter((u) => !baseline.urls.includes(u));
      if ((newUrls.length > 0 || current.count > baseline.count) && (Date.now() - startTime >= minGenerationTimeMs)) {
        console.log(`[FlowAdapter] New results appeared: ${newUrls.length} new items`);
        return { success: true };
      }

      if (generationStarted) break;
      await page.waitForTimeout(600);
    }

    if (!generationStarted) {
      console.warn('[FlowAdapter] No explicit loading spinner detected — generation may be running without spinner or finished.');
    }

    // Phase 2: Poll for completion
    while (Date.now() - startTime < timeoutMs) {
      // Check quota
      if (await isQuotaExhausted(page)) {
        return {
          success: false,
          isQuotaExhausted: true,
          error: 'Đã đạt giới hạn quota trong quá trình tạo.',
        };
      }

      // Check auth (page might have redirected to signin)
      if (await isAuthRequired(page)) {
        return {
          success: false,
          isAuthRequired: true,
          error: 'Phiên hết hạn trong quá trình tạo. Vui lòng xác thực lại.',
        };
      }

      // Check for error banners
      for (const errSel of FLOW_SELECTORS.errorBanner) {
        try {
          const errLoc = page.locator(errSel).first();
          if (await errLoc.isVisible({ timeout: 300 }).catch(() => false)) {
            const text = (await errLoc.textContent().catch(() => '')) || '';
            if (text.length < 300 && !text.toLowerCase().includes('cookie') && !text.toLowerCase().includes('notice')) {
              return {
                success: false,
                error: `Google Flow báo lỗi: ${text.trim().slice(0, 200)}`,
              };
            }
          }
        } catch {}
      }

      // Check loading indicators
      let stillLoading = false;
      for (const loadSel of FLOW_SELECTORS.loadingIndicators) {
        try {
          if (await page.locator(loadSel).first().isVisible({ timeout: 300 }).catch(() => false)) {
            stillLoading = true;
            break;
          }
        } catch {}
      }

      // Check media snapshot
      const current = await getMediaSnapshot(page);
      const newUrls = current.urls.filter((u) => !baseline.urls.includes(u));
      const hasNewResults = newUrls.length > 0 || current.count > baseline.count;

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Extract real percentage if shown on screen (e.g. 99%, 45%)
      const progressPercent = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const match = text.match(/(\d{1,3})%/);
        return match ? parseInt(match[1], 10) : null;
      }).catch(() => null);

      if (onProgress && elapsed > 0) {
        let prog = Math.min(88, 70 + Math.floor(elapsed / 2));
        let msg = `Đang chờ Google Flow tạo nội dung (${elapsed}s)...`;
        if (progressPercent !== null && progressPercent >= 0 && progressPercent <= 100) {
          prog = Math.min(95, Math.max(70, Math.floor(70 + progressPercent * 0.25)));
          msg = `Google Flow đang tạo nội dung (${progressPercent}%)...`;
        }
        onProgress({
          progress: prog,
          stage: 'generating',
          message: msg,
        });
      }

      // If new results exist and loading is done and minimum time passed
      if (hasNewResults && !stillLoading && (Date.now() - startTime >= minGenerationTimeMs)) {
        console.log(`[FlowAdapter] Generation complete: ${newUrls.length} new items found, total ${current.count}`);
        // Allow 2 seconds for high-res render in Chromium DOM
        await page.waitForTimeout(2000);
        return { success: true };
      }

      await page.waitForTimeout(1500);
    }

    return {
      success: false,
      error: 'Tạo nội dung hết thời gian sau 5 phút. Vui lòng kiểm tra Google Flow thủ công.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Download the generated result
  // Prioritized: Download Button → Canvas/Direct Extract → Screenshot
  // Strict size check: Rejects and removes any file < 10KB (prevents avatars)
  // ──────────────────────────────────────────────────────────────────────────
  private async downloadResult(
    page: Page,
    job: Job,
    targetDir: string,
    baseline?: MediaSnapshot
  ): Promise<{ success: boolean; outputFile?: string; thumbnailFile?: string; error?: string }> {
    const ext = job.type === 'image' ? 'png' : 'mp4';
    const filePath = path.join(targetDir, `${job.id}.${ext}`);
    const minImageBytes = 10240; // 10KB minimum for valid image (avoids avatars/icons)
    const minVideoBytes = 20480; // 20KB minimum for valid video

    // Clean up any stale partial file from previous attempts
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    // ── Strategy 1: Direct Playwright request via session cookies (Fastest & full-res) ────
    if (job.type === 'image') {
      try {
        const targetImgSrc = await page.evaluate((knownBaselineUrls: string[]) => {
          const isAvatarOrUI = (el: Element): boolean => {
            if (el.closest('header, nav, [role="banner"], [aria-label*="Google Account" i], [aria-label*="Tài khoản Google" i], [data-testid*="avatar" i], .gb_')) {
              return true;
            }
            const src = (el.getAttribute('src') || '').toLowerCase();
            if (
              src.includes('/a/acg8oc') ||
              src.includes('default_avatar') ||
              src.includes('ogw/af2b') ||
              src.includes('=s32') ||
              src.includes('=s48') ||
              src.includes('=s64') ||
              src.includes('=s96') ||
              src.includes('=s128')
            ) {
              return true;
            }
            const alt = (el.getAttribute('alt') || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            if (alt.includes('account') || alt.includes('tài khoản') || aria.includes('account') || aria.includes('tài khoản')) {
              return true;
            }
            return false;
          };

          const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
            if (isAvatarOrUI(img)) return false;
            const isFlow = img.src && (img.src.includes('/asb/') || img.classList.contains('image'));
            const rect = img.getBoundingClientRect();
            return isFlow || (rect.width >= 180 && rect.height >= 180) || (img.naturalWidth >= 180 && img.naturalHeight >= 180);
          });

          if (imgs.length === 0) return null;

          // Prioritize: 1. URLs not in baseline, 2. /asb/ flow media, 3. Largest area
          imgs.sort((a, b) => {
            const aIsNew = !knownBaselineUrls.includes(a.src);
            const bIsNew = !knownBaselineUrls.includes(b.src);
            if (aIsNew && !bIsNew) return -1;
            if (!aIsNew && bIsNew) return 1;

            const aIsFlow = a.src.includes('/asb/') || a.classList.contains('image');
            const bIsFlow = b.src.includes('/asb/') || b.classList.contains('image');
            if (aIsFlow && !bIsFlow) return -1;
            if (!aIsFlow && bIsFlow) return 1;

            return (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight);
          });

          return imgs[0]?.src || null;
        }, baseline?.urls || []);

        if (targetImgSrc) {
          console.log(`[FlowAdapter] Downloading target media via page.request: ${targetImgSrc.slice(0, 80)}...`);
          const resp = await page.request.get(targetImgSrc);
          if (resp.ok()) {
            const buf = await resp.body();
            if (buf.length >= minImageBytes) {
              fs.writeFileSync(filePath, buf);
              console.log(`[FlowAdapter] Downloaded media via page.request: ${buf.length} bytes to ${filePath}`);
              return { success: true, outputFile: filePath };
            } else {
              console.warn(`[FlowAdapter] page.request buffer too small (${buf.length} bytes), falling back.`);
            }
          }
        }
      } catch (reqErr: any) {
        console.warn(`[FlowAdapter] page.request download error: ${reqErr.message}`);
      }

      // ── Strategy 2: Direct Image Extraction (Canvas draw & Fetch) ─────────────
      try {
        const extractedDataUrl = await page.evaluate(async (knownBaselineUrls: string[]) => {
          const isAvatarOrUI = (el: Element): boolean => {
            if (el.closest('header, nav, [role="banner"], [aria-label*="Google Account" i], [aria-label*="Tài khoản Google" i], [data-testid*="avatar" i], .gb_')) {
              return true;
            }
            const src = (el.getAttribute('src') || '').toLowerCase();
            if (
              src.includes('/a/acg8oc') ||
              src.includes('default_avatar') ||
              src.includes('ogw/af2b') ||
              src.includes('=s32') ||
              src.includes('=s48') ||
              src.includes('=s64') ||
              src.includes('=s96') ||
              src.includes('=s128')
            ) {
              return true;
            }
            const alt = (el.getAttribute('alt') || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            if (alt.includes('account') || alt.includes('tài khoản') || aria.includes('account') || aria.includes('tài khoản')) {
              return true;
            }
            return false;
          };

          const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
            if (isAvatarOrUI(img)) return false;
            const isFlow = img.src && (img.src.includes('/asb/') || img.classList.contains('image'));
            const rect = img.getBoundingClientRect();
            return isFlow || (rect.width >= 180 && rect.height >= 180) || (img.naturalWidth >= 180 && img.naturalHeight >= 180);
          });

          if (imgs.length === 0) return null;

          imgs.sort((a, b) => {
            const aIsNew = !knownBaselineUrls.includes(a.src);
            const bIsNew = !knownBaselineUrls.includes(b.src);
            if (aIsNew && !bIsNew) return -1;
            if (!aIsNew && bIsNew) return 1;

            const aIsFlow = a.src.includes('/asb/') || a.classList.contains('image');
            const bIsFlow = b.src.includes('/asb/') || b.classList.contains('image');
            if (aIsFlow && !bIsFlow) return -1;
            if (!aIsFlow && bIsFlow) return 1;

            return (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight);
          });

          const bestImg = imgs[0];
          if (!bestImg) return null;

          // Method A: In-page fetch with credentials
          try {
            const res = await fetch(bestImg.src, { credentials: 'include' });
            if (res.ok) {
              const blob = await res.blob();
              return await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch {}

          // Method B: Draw to temporary canvas
          try {
            const canvas = document.createElement('canvas');
            canvas.width = bestImg.naturalWidth || bestImg.clientWidth || 512;
            canvas.height = bestImg.naturalHeight || bestImg.clientHeight || 512;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bestImg, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/png');
              if (dataUrl && dataUrl.length > 5000) {
                return dataUrl;
              }
            }
          } catch {}

          return null;
        }, baseline?.urls || []);

        if (extractedDataUrl && extractedDataUrl.startsWith('data:')) {
          const base64Data = extractedDataUrl.split(',')[1];
          const buf = Buffer.from(base64Data, 'base64');
          if (buf.length >= minImageBytes) {
            fs.writeFileSync(filePath, buf);
            console.log(`[FlowAdapter] Saved image via direct extraction: ${buf.length} bytes to ${filePath}`);
            return { success: true, outputFile: filePath };
          }
        }
      } catch (err: any) {
        console.warn('[FlowAdapter] Strategy 2 (direct extraction) error:', err.message);
      }

      // ── Strategy 3: Canvas Element Extraction ──────────────────────────────
      try {
        const canvasDataUrl = await page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas')).filter((c) => {
            const rect = c.getBoundingClientRect();
            return rect.width >= 180 && rect.height >= 180;
          });
          if (canvases.length > 0) {
            try {
              return canvases[canvases.length - 1].toDataURL('image/png');
            } catch {}
          }
          return null;
        });

        if (canvasDataUrl && canvasDataUrl.startsWith('data:')) {
          const base64Data = canvasDataUrl.split(',')[1];
          const buf = Buffer.from(base64Data, 'base64');
          if (buf.length >= minImageBytes) {
            fs.writeFileSync(filePath, buf);
            console.log(`[FlowAdapter] Saved image via canvas extraction: ${buf.length} bytes`);
            return { success: true, outputFile: filePath };
          }
        }
      } catch (err: any) {
        console.warn('[FlowAdapter] Strategy 3 (canvas extraction) error:', err.message);
      }

      // ── Strategy 4: High-res Element Screenshot ────────────────────────────
      for (const sel of FLOW_SELECTORS.resultImage) {
        try {
          const locs = page.locator(sel);
          const count = await locs.count().catch(() => 0);
          for (let i = count - 1; i >= 0; i--) {
            const loc = locs.nth(i);
            if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
              const box = await loc.boundingBox().catch(() => null);
              if (box && box.width >= 180 && box.height >= 180) {
                await loc.screenshot({ path: filePath });
                if (fs.existsSync(filePath)) {
                  const sz = fs.statSync(filePath).size;
                  if (sz >= minImageBytes) {
                    console.log(`[FlowAdapter] Saved image via element screenshot: ${sz} bytes`);
                    return { success: true, outputFile: filePath };
                  } else {
                    fs.unlinkSync(filePath);
                  }
                }
              }
            }
          }
        } catch {}
      }
    }

    // ── Strategy 5: Hover over newest result card and click Download button ────
    try {
      const candidateCards = page.locator(FLOW_SELECTORS.resultCard.join(', '));
      const cardCount = await candidateCards.count().catch(() => 0);
      if (cardCount > 0) {
        const newestCard = candidateCards.last();
        await newestCard.hover({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600);
      }

      for (const dlSel of FLOW_SELECTORS.downloadButton) {
        try {
          const dlBtns = page.locator(dlSel);
          const count = await dlBtns.count().catch(() => 0);
          if (count > 0) {
            for (let i = count - 1; i >= 0; i--) {
              const btn = dlBtns.nth(i);
              if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
                console.log(`[FlowAdapter] Attempting download click via: ${dlSel} (index ${i})`);
                try {
                  const [download] = await Promise.all([
                    page.waitForEvent('download', { timeout: 15000 }),
                    btn.click({ timeout: 3000 }),
                  ]);
                  await download.saveAs(filePath);
                  if (fs.existsSync(filePath)) {
                    const sz = fs.statSync(filePath).size;
                    if (sz >= (job.type === 'image' ? minImageBytes : minVideoBytes)) {
                      console.log(`[FlowAdapter] Downloaded via button to: ${filePath} (${sz} bytes)`);
                      return { success: true, outputFile: filePath };
                    } else {
                      fs.unlinkSync(filePath);
                    }
                  }
                } catch (dlErr: any) {
                  console.warn(`[FlowAdapter] Download button event timeout: ${dlErr.message}`);
                }
              }
            }
          }
        } catch {}
      }
    } catch (e: any) {
      console.warn('[FlowAdapter] Download button error:', e.message);
    }

    // ── Strategy 5: For video, grab src attribute and download via fetch ─────
    if (job.type === 'video') {
      for (const sel of FLOW_SELECTORS.resultVideo) {
        try {
          const locs = page.locator(sel);
          const count = await locs.count().catch(() => 0);
          for (let i = count - 1; i >= 0; i--) {
            const loc = locs.nth(i);
            if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
              const src = await loc.getAttribute('src').catch(() => null);
              if (src && (src.startsWith('http') || src.startsWith('blob:'))) {
                const saved = await page.evaluate(async (url: string) => {
                  try {
                    const res = await fetch(url, { credentials: 'include' });
                    if (!res.ok) return null;
                    const blob = await res.blob();
                    const reader = new FileReader();
                    return await new Promise<string>((resolve) => {
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  } catch {
                    return null;
                  }
                }, src);

                if (saved && typeof saved === 'string' && saved.startsWith('data:')) {
                  const base64Data = saved.split(',')[1];
                  const buf = Buffer.from(base64Data, 'base64');
                  if (buf.length >= minVideoBytes) {
                    fs.writeFileSync(filePath, buf);
                    const thumbPath = filePath.replace('.mp4', '_thumb.png');
                    await loc.screenshot({ path: thumbPath }).catch(() => {});
                    console.log(`[FlowAdapter] Saved video via fetch: ${buf.length} bytes`);
                    return { success: true, outputFile: filePath, thumbnailFile: thumbPath };
                  }
                }
              }

              // Fallback: screenshot video frame as thumbnail
              const thumbPath = filePath.replace('.mp4', '_thumb.png');
              await loc.screenshot({ path: thumbPath }).catch(() => {});
            }
          }
        } catch {}
      }
    }

    // ── Strict Final Gate ────────────────────────────────────────────────────
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const minRequired = job.type === 'image' ? minImageBytes : minVideoBytes;
      if (stats.size < minRequired) {
        console.error(`[FlowAdapter] File too small (${stats.size} bytes < ${minRequired} bytes), deleting.`);
        fs.unlinkSync(filePath);
      } else {
        return { success: true, outputFile: filePath };
      }
    }

    return {
      success: false,
      error: 'Không tìm thấy kết quả media hợp lệ trên Google Flow hoặc file tải về không đạt tiêu chuẩn (>10KB). Vui lòng thử lại.',
    };
  }
}
