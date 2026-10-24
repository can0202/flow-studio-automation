import { chromium, type BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { AppDatabase } from '../db/database.ts';
import type { Session, SessionStatus } from '../../shared/types.ts';
import { FLOW_SELECTORS, FLOW_URLS, getBrowserLaunchOptions } from './providers/flow-adapter.ts';

export class SessionManager {
  private db: AppDatabase;
  private baseDir: string;
  private activeContexts: Map<string, BrowserContext> = new Map();

  constructor(db: AppDatabase, customBaseDir?: string) {
    this.db = db;
    if (customBaseDir) {
      this.baseDir = customBaseDir;
    } else {
      const root = app ? app.getPath('userData') : process.cwd();
      this.baseDir = path.join(root, 'sessions');
    }

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getSessions(): Session[] {
    return this.db.getSessions();
  }

  public getSessionById(id: string): Session | undefined {
    return this.db.getSessionById(id);
  }

  public addSession(name: string, initialStatus?: SessionStatus): Session {
    const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const profileDir = path.join(this.baseDir, id);

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const settings = this.db.getSettings();
    const status = initialStatus || (settings.simulationMode ? 'ready' : 'auth_required');

    return this.db.addSession(id, name, profileDir, status);
  }

  public isBrowserOpen(sessionId: string): boolean {
    return this.activeContexts.has(sessionId);
  }

  public getActiveContext(sessionId: string): BrowserContext | undefined {
    return this.activeContexts.get(sessionId);
  }

  public async closeBrowser(sessionId: string): Promise<void> {
    const context = this.activeContexts.get(sessionId);
    if (context) {
      try {
        await context.close();
      } catch {}
      this.activeContexts.delete(sessionId);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  public async openBrowser(sessionId: string): Promise<{ success: boolean; message: string }> {
    const session = this.db.getSessionById(sessionId);
    if (!session) {
      return { success: false, message: 'Không tìm thấy phiên.' };
    }

    if (this.activeContexts.has(sessionId)) {
      return { success: false, message: 'Trình duyệt đã đang mở.' };
    }

    try {
      console.log(`[SessionManager] Opening browser for session ${session.name} with profile at ${session.profileDir}`);
      const context = await chromium.launchPersistentContext(session.profileDir, getBrowserLaunchOptions(false));

      this.activeContexts.set(sessionId, context);

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      // Always navigate to root, never /about — /about triggers Google identity re-verification
      await page.goto(FLOW_URLS.primary, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // If landed on /about, automatically click "Create with Google Flow" to trigger the Google identity verification right in this browser window!
      if (page.url().includes('/about')) {
        const createBtn = page.locator('button:has-text("Create with Google Flow"), button:has-text("Tạo bằng Google Flow"), button:has-text("Try Google Flow"), button:has-text("Get started")').first();
        if (await createBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          console.log('[SessionManager] Auto-clicking "Create with Google Flow" on /about to prompt login/verification...');
          await createBtn.click().catch(() => {});
        }
      }

      // Listen for window close (Do NOT run testConnection automatically on close to prevent background profile locks!)
      context.on('close', () => {
        this.activeContexts.delete(sessionId);
        console.log(`[SessionManager] Session ${session.name} browser window was closed.`);
      });

      return {
        success: true,
        message: `Đã mở trình duyệt cho "${session.name}". Vui lòng đăng nhập tài khoản Google. Nếu Google hiện "Xác minh danh tính", hãy nhập mật khẩu để vào thẳng Google Flow Studio.`,
      };
    } catch (err: any) {
      console.error('[SessionManager] Failed to launch browser:', err);
      return { success: false, message: `Không thể mở trình duyệt: ${err.message}` };
    }
  }

  public async testConnection(sessionId: string): Promise<{ success: boolean; status: SessionStatus; message: string }> {
    const session = this.db.getSessionById(sessionId);
    if (!session) {
      return { success: false, status: 'disabled', message: 'Không tìm thấy phiên' };
    }

    const settings = this.db.getSettings();

    // If simulation mode is on, test connection cleanly
    if (settings.simulationMode) {
      this.db.updateSessionStatus(sessionId, 'ready', 'Kết nối (Đang giả lập)');
      return {
        success: true,
        status: 'ready',
        message: `Phiên "${session.name}" đã xác minh sẵn sàng (Đang chạy chế độ giả lập).`,
      };
    }

    let context: BrowserContext | null = null;
    let ownContext = false;

    try {
      if (this.activeContexts.has(sessionId)) {
        context = this.activeContexts.get(sessionId)!;
      } else {
        context = await chromium.launchPersistentContext(session.profileDir, getBrowserLaunchOptions(true));
        ownContext = true;
      }

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      // Always go directly to root — NEVER to /about or via enterStudio buttons.
      // Clicking "Create with Google Flow" from /about triggers Google identity re-verification.
      try {
        await page.goto(FLOW_URLS.primary, { waitUntil: 'domcontentloaded', timeout: 35000 });
      } catch (e: any) {
        console.warn('[SessionManager] testConnection initial goto notice:', e.message);
      }

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // 1. Check URL for Google login/identity-verification redirect — hard fail
      const currentUrl = page.url();
      if (
        currentUrl.includes('accounts.google.com/signin') ||
        currentUrl.includes('accounts.google.com/ServiceLogin') ||
        currentUrl.includes('accounts.google.com/InteractiveLogin') ||
        currentUrl.includes('accounts.google.com/v3/signin') ||
        currentUrl.includes('accounts.google.com/v3/signin/confirmidentifier')
      ) {
        this.db.updateSessionStatus(sessionId, 'auth_required', 'Yêu cầu đăng nhập Google');
        return {
          success: false,
          status: 'auth_required',
          message: 'Cần đăng nhập: Vui lòng bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập Google Flow.',
        };
      }

      // 2. If already inside a project workspace, session is definitely ready
      if (currentUrl.includes('/project/')) {
        const quotaInfo = await this.scrapeQuotaInfo(page);
        this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động', quotaInfo || undefined);
        if (quotaInfo) this.db.updateSessionQuota(sessionId, quotaInfo);
        return {
          success: true,
          status: 'ready',
          quotaInfo: quotaInfo || undefined,
          message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
        };
      }

      // 3. If on the project dashboard (flow.google.com/), directly navigate to an existing project
      //    NEVER click "Create with Google Flow" or enterStudio buttons — those trigger
      //    Google's identity re-verification (confirmidentifier) for fresh sessions.
      if (currentUrl === 'https://flow.google.com/' || currentUrl === 'https://flow.google.com') {
        // Try to find and directly navigate to a project URL in the DOM
        const projectHref = await page.evaluate(() => {
          const link = document.querySelector<HTMLAnchorElement>('a[href*="/project/"]');
          return link ? link.getAttribute('href') : null;
        }).catch(() => null);

        if (projectHref) {
          const targetProjectUrl = projectHref.startsWith('http')
            ? projectHref
            : `https://flow.google.com${projectHref}`;
          console.log(`[SessionManager] Navigating directly to project: ${targetProjectUrl}`);
          await page.goto(targetProjectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(2500);

          if (page.url().includes('/project/')) {
            const quotaInfo = await this.scrapeQuotaInfo(page);
            this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động', quotaInfo || undefined);
            if (quotaInfo) this.db.updateSessionQuota(sessionId, quotaInfo);
            return {
              success: true,
              status: 'ready',
              quotaInfo: quotaInfo || undefined,
              message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
            };
          }
        }

        // No project found yet — check if user avatar (logged-in signal) is present
        const hasAvatar = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('a, button, img'));
          for (const el of elements) {
            const src = ((el as HTMLImageElement).src || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const href = ((el as HTMLAnchorElement).href || '').toLowerCase();
            if (
              href.includes('signoutoptions') ||
              aria.includes('google account') || aria.includes('tài khoản google') ||
              aria.includes('@gmail.com') || aria.includes('@') ||
              (src.includes('googleusercontent.com') && !src.includes('default_avatar'))
            ) return true;
          }
          return false;
        }).catch(() => false);

        if (hasAvatar) {
          const quotaInfo = await this.scrapeQuotaInfo(page);
          this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động', quotaInfo || undefined);
          if (quotaInfo) this.db.updateSessionQuota(sessionId, quotaInfo);
          return {
            success: true,
            status: 'ready',
            quotaInfo: quotaInfo || undefined,
            message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng (chưa có dự án, tạo dự án đầu tiên để bắt đầu).`,
          };
        }
      }

      // 4. For /about or other marketing pages — test entering Studio
      if (page.url().includes('/about')) {
        console.log('[SessionManager] Testing entry to Studio from /about...');
        const createBtn = page.locator('button:has-text("Create with Google Flow"), button:has-text("Tạo bằng Google Flow"), button:has-text("Try Google Flow"), button:has-text("Get started")').first();
        if (await createBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await createBtn.click().catch(() => {});
          await page.waitForTimeout(3000);
        }
      }

      const postEntryUrl = page.url();
      if (
        postEntryUrl.includes('accounts.google.com/signin') ||
        postEntryUrl.includes('accounts.google.com/ServiceLogin') ||
        postEntryUrl.includes('accounts.google.com/v3/signin') ||
        postEntryUrl.includes('accounts.google.com/v3/signin/confirmidentifier') ||
        postEntryUrl.includes('accounts.google.com/v3/signin/rejected')
      ) {
        this.db.updateSessionStatus(sessionId, 'auth_required', 'Cần xác minh danh tính tài khoản Google');
        return {
          success: false,
          status: 'auth_required',
          message: 'Tài khoản cần xác minh danh tính: Vui lòng bấm "Mở trình duyệt (Đăng nhập)", nhập mật khẩu Google để hoàn tất vào Google Flow Studio.',
        };
      }

      // If now inside /project/ or studio, session is ready
      if (postEntryUrl.includes('/project/') || postEntryUrl === 'https://flow.google.com/' || postEntryUrl === 'https://flow.google.com') {
        const quotaInfo = await this.scrapeQuotaInfo(page);
        this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động', quotaInfo || undefined);
        if (quotaInfo) this.db.updateSessionQuota(sessionId, quotaInfo);
        return {
          success: true,
          status: 'ready',
          quotaInfo: quotaInfo || undefined,
          message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
        };
      }

      // 5. Check quota exhausted via page body text
      const hasQuotaText = await page.evaluate(() => {
        const txt = (document.body?.innerText || '').toLowerCase();
        return txt.includes('hết tín dụng') || txt.includes('dùng hết tín dụng') ||
               txt.includes('out of credits') || txt.includes('quota exceeded');
      }).catch(() => false);

      if (hasQuotaText) {
        this.db.updateSessionStatus(sessionId, 'quota_exhausted', 'Đã đạt giới hạn quota hàng ngày');
        return {
          success: false,
          status: 'quota_exhausted',
          message: 'Quá hạn quota: tài khoản này đã đạt giới hạn tín dụng hàng ngày của Google Flow.',
        };
      }

      // Default: If still on flow.google.com landing/about page and couldn't enter studio, require auth
      this.db.updateSessionStatus(sessionId, 'auth_required', 'Chưa hoàn tất đăng nhập Google Flow Studio');
      return {
        success: false,
        status: 'auth_required',
        message: 'Cần đăng nhập: Vui lòng bấm "Mở trình duyệt (Đăng nhập)" và xác minh để vào Google Flow Studio.',
      };
    } catch (err: any) {
      this.db.updateSessionStatus(sessionId, 'paused', `Kiểm tra kết nối thất bại: ${err.message}`);
      return {
        success: false,
        status: 'paused',
        message: `Không thể kết nối Google Flow: ${err.message}`,
      };
    } finally {
      if (ownContext && context) {
        try {
          await context.close();
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  public updateStatus(sessionId: string, status: SessionStatus, notes?: string) {
    this.db.updateSessionStatus(sessionId, status, notes);
  }

  // ─── Quota scraping helper ──────────────────────────────────────────────────
  // Attempts to find and extract credit/quota information from the current page.
  // Returns a formatted string like "72 / 100 credits" or null if not found.
  private async scrapeQuotaInfo(page: import('playwright').Page): Promise<string | null> {
    try {
      const quotaText = await page.evaluate(() => {
        const body = document.body?.innerText || '';

        // Pattern 1: "X credits remaining" / "X / Y credits" / "X tín dụng"
        const patterns = [
          /(\d+)\s*\/\s*(\d+)\s*(credits?|tín dụng)/i,
          /(\d+)\s*(credits?\s*remaining|tín dụng còn lại)/i,
          /(\d+)\s*(credits?|tín dụng)/i,
        ];

        for (const pattern of patterns) {
          const match = body.match(pattern);
          if (match) return match[0].trim();
        }

        // Pattern 2: Look for quota/credit elements in DOM
        const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
          if (el.children.length > 5) return false;
          const text = (el as HTMLElement).innerText?.trim() || '';
          return /\d+\s*(\/|credits?|tín dụng)/i.test(text) && text.length < 60;
        });

        if (candidates.length > 0) {
          return (candidates[0] as HTMLElement).innerText.trim();
        }

        return null;
      }).catch(() => null);

      return quotaText;
    } catch {
      return null;
    }
  }

  // ─── Standalone quota check ─────────────────────────────────────────────────
  // Launches a headless browser (or reuses existing context) to read quota.
  public async getSessionQuota(sessionId: string): Promise<{ success: boolean; quotaInfo: string }> {
    const session = this.db.getSessionById(sessionId);
    if (!session) return { success: false, quotaInfo: 'Không tìm thấy phiên' };

    let context: import('playwright').BrowserContext | null = null;
    let ownContext = false;

    try {
      if (this.activeContexts.has(sessionId)) {
        context = this.activeContexts.get(sessionId)!;
      } else {
        context = await chromium.launchPersistentContext(session.profileDir, getBrowserLaunchOptions(true));
        ownContext = true;
      }

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      try {
        await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch {}
      await page.waitForTimeout(3000);

      const quotaText = await this.scrapeQuotaInfo(page);
      if (quotaText) {
        this.db.updateSessionQuota(sessionId, quotaText);
        return { success: true, quotaInfo: quotaText };
      }
      return { success: false, quotaInfo: 'Không tìm thấy thông tin quota' };
    } catch (err: any) {
      return { success: false, quotaInfo: `Lỗi: ${err.message}` };
    } finally {
      if (ownContext && context) {
        try { await context.close(); } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  public async removeSession(sessionId: string) {
    if (this.activeContexts.has(sessionId)) {
      try {
        await this.activeContexts.get(sessionId)!.close();
      } catch {}
      this.activeContexts.delete(sessionId);
    }

    const session = this.db.getSessionById(sessionId);
    if (session && fs.existsSync(session.profileDir)) {
      try {
        fs.rmSync(session.profileDir, { recursive: true, force: true });
      } catch {}
    }

    this.db.removeSession(sessionId);
  }
}
