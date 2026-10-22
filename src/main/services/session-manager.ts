import { chromium, type BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { AppDatabase } from '../db/database.ts';
import type { Session, SessionStatus } from '../../shared/types.ts';
import { FLOW_SELECTORS, FLOW_URLS } from './providers/flow-adapter.ts';

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
      const settings = this.db.getSettings();
      const targetUrl = settings.flowUrl || FLOW_URLS.primary;

      console.log(`[SessionManager] Opening browser for session ${session.name} with profile at ${session.profileDir}`);
      const context = await chromium.launchPersistentContext(session.profileDir, {
        headless: false,
        viewport: { width: 1280, height: 850 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      this.activeContexts.set(sessionId, context);

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      await page.goto(targetUrl);

      // Listen for window close
      context.on('close', async () => {
        this.activeContexts.delete(sessionId);
        console.log(`[SessionManager] Session ${session.name} browser window was closed by user.`);
        await this.testConnection(sessionId);
      });

      return {
        success: true,
        message: `Đã mở trình duyệt cho "${session.name}". Vui lòng đăng nhập Google Flow thủ công.`,
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
        context = await chromium.launchPersistentContext(session.profileDir, {
          headless: true,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
        ownContext = true;
      }

      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      const targetUrl = settings.flowUrl || FLOW_URLS.primary;
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      } catch (e: any) {
        console.warn('[SessionManager] testConnection initial goto notice:', e.message);
      }

      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1500);

      // 1. Check URL for login redirection
      const currentUrl = page.url();
      if (
        currentUrl.includes('accounts.google.com/signin') ||
        currentUrl.includes('accounts.google.com/ServiceLogin') ||
        currentUrl.includes('accounts.google.com/InteractiveLogin')
      ) {
        this.db.updateSessionStatus(sessionId, 'auth_required', 'Yêu cầu đăng nhập Google');
        return {
          success: false,
          status: 'auth_required',
          message: 'Cần đăng nhập: Vui lòng bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập Google Flow.',
        };
      }

      // 2. Deep check DOM for login link vs user avatar
      const domAuthStatus = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, img'));
        let hasSignIn = false;
        let hasUserAvatar = false;

        for (const el of elements) {
          const href = ((el as HTMLAnchorElement).href || '').toLowerCase();
          const src = ((el as HTMLImageElement).src || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const alt = (el.getAttribute('alt') || '').toLowerCase();
          const text = (el.textContent || '').trim().toLowerCase();

          if (
            href.includes('accounts.google.com') ||
            href.includes('servicelogin') ||
            text === 'sign in' || text === 'đăng nhập' ||
            aria.includes('sign in') || aria.includes('đăng nhập')
          ) {
            hasSignIn = true;
          }

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

      if (domAuthStatus?.hasSignIn && !domAuthStatus.hasUserAvatar) {
        this.db.updateSessionStatus(sessionId, 'auth_required', 'Yêu cầu đăng nhập Google');
        return {
          success: false,
          status: 'auth_required',
          message: 'Cần đăng nhập: Vui lòng bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập tài khoản Google Flow của bạn.',
        };
      }

      if (domAuthStatus?.hasUserAvatar) {
        this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động');
        return {
          success: true,
          status: 'ready',
          message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
        };
      }

      // 3. Check if user is ALREADY logged in via Playwright selectors
      for (const sel of FLOW_SELECTORS.userLoggedInIndicators) {
        try {
          const isVis = await page.locator(sel).first().isVisible({ timeout: 1200 }).catch(() => false);
          if (isVis) {
            this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động');
            return {
              success: true,
              status: 'ready',
              message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
            };
          }
        } catch {}
      }

      // 4. If landing page has Enter Studio button, try clicking it to verify workspace
      for (const sel of FLOW_SELECTORS.enterStudioButtons) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(2000);
            break;
          }
        } catch {}
      }

      // Re-check logged-in indicators after entering studio
      for (const sel of FLOW_SELECTORS.userLoggedInIndicators) {
        try {
          const isVis = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false);
          if (isVis) {
            this.db.updateSessionStatus(sessionId, 'ready', 'Phiên kết nối và hoạt động');
            return {
              success: true,
              status: 'ready',
              message: `Phiên "${session.name}" đã đăng nhập và sẵn sàng.`,
            };
          }
        } catch {}
      }

      // 5. Check quota exhausted
      for (const sel of FLOW_SELECTORS.quotaExhaustedIndicators) {
        try {
          const isVis = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false);
          if (isVis) {
            this.db.updateSessionStatus(sessionId, 'quota_exhausted', 'Đã đạt giới hạn quota hàng ngày');
            return {
              success: false,
              status: 'quota_exhausted',
              message: 'Quá hạn quota: tài khoản này đã đạt giới hạn tạo nội dung hàng ngày.',
            };
          }
        } catch {}
      }

      // 6. Check DOM auth required
      for (const sel of FLOW_SELECTORS.authRequiredIndicators) {
        try {
          const isVis = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false);
          if (isVis) {
            this.db.updateSessionStatus(sessionId, 'auth_required', 'Yêu cầu đăng nhập Google');
            return {
              success: false,
              status: 'auth_required',
              message: 'Cần đăng nhập: vui lòng dùng "Mở trình duyệt" để đăng nhập Google Flow.',
            };
          }
        } catch {}
      }

      // If cannot confirm login and on flow.google.com landing page, default to auth_required
      this.db.updateSessionStatus(sessionId, 'auth_required', 'Chưa xác thực đăng nhập Google Flow');
      return {
        success: false,
        status: 'auth_required',
        message: 'Cần đăng nhập: Vui lòng bấm "Mở trình duyệt (Đăng nhập)" để đăng nhập tài khoản Google Flow.',
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
