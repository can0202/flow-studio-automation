import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { SyncMediaOptions, SyncProgress, DiscoveredProject } from '../../shared/types.ts';
import type { OutputManager } from './output-manager.ts';
import type { SessionManager } from './session-manager.ts';
import { BatchNamer } from './batch-namer.ts';

export class MediaSyncService {
  private outputManager: OutputManager;
  private sessionManager: SessionManager;
  private isCancelled: boolean = false;
  private activeContext: BrowserContext | null = null;

  constructor(outputManager: OutputManager, sessionManager: SessionManager) {
    this.outputManager = outputManager;
    this.sessionManager = sessionManager;
  }

  public cancel() {
    this.isCancelled = true;
    if (this.activeContext) {
      this.activeContext.close().catch(() => {});
      this.activeContext = null;
    }
  }

  /**
   * Scan and return the list of projects found on Google Flow.
   * Does NOT download anything — used to populate the project picker UI.
   */
  public async scanProjects(
    sessionId?: string | null
  ): Promise<{ success: boolean; projects: DiscoveredProject[]; message: string }> {
    // Resolve the target session — handle null/undefined/empty from IPC serialization
    const sessions = this.sessionManager.getSessions();
    const cleanSessionId = sessionId && sessionId.trim() ? sessionId.trim() : null;
    let targetSession = cleanSessionId ? this.sessionManager.getSessionById(cleanSessionId) : undefined;
    
    // Fallback if not found or empty: prioritize open browser > ready session > newest session
    if (!targetSession) {
      targetSession = sessions.find((s) => this.sessionManager.isBrowserOpen(s.id))
        || sessions.find((s) => s.status === 'ready')
        || (sessions.length > 0 ? sessions[sessions.length - 1] : undefined);
    }

    console.log(`[MediaSync] scanProjects — requested sessionId: "${sessionId}", resolved: "${targetSession?.name ?? 'none'} (${targetSession?.id ?? '-'})", browserOpen: ${targetSession ? this.sessionManager.isBrowserOpen(targetSession.id) : false}`);

    if (!targetSession) {
      return { success: false, projects: [], message: 'Không tìm thấy phiên làm việc. Vui lòng tạo ít nhất 1 phiên trong tab Cài đặt.' };
    }

    if (!fs.existsSync(targetSession.profileDir)) {
      return { success: false, projects: [], message: `Thư mục hồ sơ phiên không tồn tại: ${targetSession.profileDir}` };
    }

    let context = null;
    let isOwnContext = false;
    try {
      const activeContext = this.sessionManager.getActiveContext(targetSession.id);
      if (activeContext) {
        context = activeContext;
      } else {
        context = await chromium.launchPersistentContext(targetSession.profileDir, {
          headless: false,
          viewport: { width: 1440, height: 900 },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
        isOwnContext = true;
      }

      const page = context.pages().length > 0 ? context.pages()[0] : (await context.newPage());
      page.setDefaultTimeout(35000);

      // Check if project cards are already visible on the current page before navigating away
      const hasVisibleProjectCards = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        return /Tháng\s*\d+/i.test(text) ||
          /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(text) ||
          /\b\d{1,2}:\d{2}\b/.test(text);
      }).catch(() => false);

      if (!hasVisibleProjectCards) {
        // Navigate to Google Flow home to see all projects
        if (page.url() === 'about:blank' || page.url().includes('/about') ||
            page.url() === 'https://flow.google.com/' || page.url() === 'https://flow.google.com' ||
            page.url().includes('/project/')) {
          await page.goto('https://flow.google.com', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);

          // Click through landing page if needed
          for (const sel of [
            'button:has-text("Create with Google Flow")',
            'button:has-text("Tạo bằng Google Flow")',
            'button:has-text("Get started")',
            'button:has-text("Bắt đầu")',
          ]) {
            try {
              const btn = page.locator(sel).first();
              if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) {
                await btn.click().catch(() => {});
                await page.waitForTimeout(4000);
                break;
              }
            } catch {}
          }
        }
      }

      // Wait a bit for dynamic React components to hydrate
      await page.waitForTimeout(2000);

      // Progressive scrolling to trigger lazy loading of all 20+ project cards
      for (let scrollPass = 0; scrollPass < 8; scrollPass++) {
        await page.evaluate(() => {
          window.scrollBy(0, 900);
        });
        await page.waitForTimeout(600);
      }
      // Scroll back to top
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await page.waitForTimeout(600);

      const discovered = await page.evaluate(() => {
        const results: { name: string; url?: string }[] = [];
        const seenUrls = new Set<string>();
        const seenNames = new Set<string>();

        const addItem = (name: string, url?: string) => {
          const cleanName = name
            .replace(/^Mở dự án\s*/i, '')
            .replace(/^Open project\s*/i, '')
            .replace(/^Mở\s*/i, '')
            .replace(/^Open\s*/i, '')
            .trim();
          if (!cleanName || cleanName.length < 2) return;
          const lower = cleanName.toLowerCase();
          const blacklist = [
            'overview', 'models', 'capabilities', 'tools', 'flow sessions', 'pricing',
            'sign in', 'đăng nhập', 'create with google flow', 'tạo bằng google flow',
            'get started', 'bắt đầu', 'new project', 'dự án mới', 'explore', 'khám phá',
            'faq', 'help', 'privacy', 'terms', 'google ai subscriptions', 'try in google flow'
          ];
          if (blacklist.includes(lower)) return;
          if (url && seenUrls.has(url)) return;
          if (seenNames.has(cleanName)) return;
          if (url) seenUrls.add(url);
          seenNames.add(cleanName);
          results.push({ name: cleanName, url });
        };

        // Strategy 0: Google Flow Angular components (<flow-project-card>, .project-card)
        // Each card has a.project-thumbnail-container with href="/project/<id>" and .project-title-label
        const flowCards = Array.from(document.querySelectorAll('flow-project-card, .project-card, .projects-grid-item'));
        for (const card of flowCards) {
          const titleEl = card.querySelector('.project-title-label, .project-card-footer, [class*="title"], [class*="label"]');
          let name = (titleEl as HTMLElement)?.innerText?.trim() || '';
          if (name.includes('\n')) name = name.split('\n')[0].trim();

          if (!name) {
            const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            while ((n = walker.nextNode())) {
              const val = (n.nodeValue || '').trim();
              if (/Tháng\s*\d+/i.test(val) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(val) || /\d{1,2}:\d{2}/.test(val)) {
                name = val;
                break;
              }
            }
          }

          const a = (card.querySelector('a.project-thumbnail-container') || card.querySelector('a[href*="/project/"]') || card.querySelector('a')) as HTMLAnchorElement | null;
          let href = a?.getAttribute('href') || a?.href || '';
          if (href && !href.startsWith('http')) {
            href = `${window.location.origin}${href}`;
          }

          if (name) {
            addItem(name, href || undefined);
          }
        }

        // Strategy 1: TreeWalker on all leaf text nodes to catch Vietnamese/English dates and times
        // Examples: "Tháng 10 21 - 15:29", "Tháng 10 21 - 14:39", "Oct 21 - 15:29"
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          const val = (textNode.nodeValue || '').trim();
          if (!val || val.length < 3 || val.length > 80) continue;

          const isVietnameseDate = /Tháng\s*\d+/i.test(val);
          const isEnglishDate = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(val);
          const isTimePattern = /\b\d{1,2}:\d{2}\b/.test(val) && val.includes('-');
          const isProjectPattern = /^(?:Project|Dự án)\s+/i.test(val);

          if (isVietnameseDate || isEnglishDate || isTimePattern || isProjectPattern) {
            const parent = textNode.parentElement;
            if (!parent) continue;
            if (parent.closest('header, nav, footer, [role="tooltip"], [role="banner"], [role="dialog"], [data-testid*="user"]')) continue;

            const a = parent.closest('a') as HTMLAnchorElement | null;
            const fullUrl = a && a.href ? a.href : undefined;
            addItem(val, fullUrl);
          }
        }

        // Strategy 2: Project card containers with thumbnail images
        const cardCandidates = Array.from(document.querySelectorAll(
          '[role="button"], [role="link"], [data-testid*="project"], [class*="card"], [class*="item"], [role="listitem"]'
        ));
        for (const card of cardCandidates) {
          if (card.closest('header, nav, footer, [role="banner"]')) continue;
          const hasThumbnail = card.querySelector('img, video, canvas, [style*="background-image"]');
          if (!hasThumbnail) continue;

          const cardText = (card as HTMLElement).innerText?.trim() || '';
          const lines = cardText.split('\n').map((l) => l.trim()).filter((l) => l.length > 2 && l.length < 80);
          for (const line of lines) {
            if (/Tháng\s*\d+/i.test(line) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(line) || /\d{1,2}:\d{2}/.test(line) || /dự án/i.test(line) || /project/i.test(line)) {
              const a = card.closest('a') || card.querySelector('a');
              addItem(line, a ? a.href : undefined);
              break;
            }
          }
        }

        // Strategy 3: Anchor tags linking to project URLs
        const projectUrlPatterns = [
          '/project/', '/projects/', '/flow/project', '/flow/p/',
          '/fx/tools/flow/project', 'project=', '/shared/tool/',
        ];
        const anchors = Array.from(document.querySelectorAll('a'));
        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          const hrefLow = href.toLowerCase();
          if (!projectUrlPatterns.some((p) => hrefLow.includes(p))) continue;
          const fullUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;
          const label =
            a.getAttribute('aria-label') ||
            (a as HTMLElement).innerText?.trim() ||
            a.textContent?.trim() || '';
          addItem(label || fullUrl, fullUrl);
        }

        return results;
      });

      console.log(`[MediaSync] scanProjects found ${discovered.length} project(s):`, discovered.map((p) => p.name));

      if (discovered.length > 0) {
        return { success: true, projects: discovered, message: `Tìm thấy ${discovered.length} dự án.` };
      } else {
        // If user is currently inside a project workspace, return that single project
        if (page.url().includes('/project/')) {
          const pageTitle = (await page.title()) || 'FlowStudioProject';
          const cleanTitle = pageTitle.replace(/\s*[-–—|].*$/, '').trim();
          return {
            success: true,
            projects: [{ name: cleanTitle || 'FlowStudioProject', url: page.url() }],
            message: 'Đang ở trong trang làm việc dự án, phát hiện 1 dự án hiện tại.',
          };
        }

        return {
          success: false,
          projects: [],
          message: 'Không tìm thấy dự án nào trên Google Flow. Hãy kiểm tra lại phiên làm việc đã đăng nhập và đang mở màn hình dự án.',
        };
      }
    } catch (err: any) {
      console.error('[MediaSync] scanProjects error:', err);
      return { success: false, projects: [], message: `Lỗi quét dự án: ${err.message || String(err)}` };
    } finally {
      if (isOwnContext && context) {
        await (context as any).close().catch(() => {});
      }
    }
  }

  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
  }

  /**
   * Robustly scroll to and click into a project card from Google Flow gallery.
   */
  private async enterProjectCard(page: Page, projectName: string): Promise<boolean> {
    console.log(`[MediaSync] Entering project card: "${projectName}"...`);

    // 1. Check if we are already inside this project's workspace
    const pageTitle = await page.title().catch(() => '');
    const currentUrl = page.url();
    if (currentUrl.includes('/project/') && pageTitle.toLowerCase().includes(projectName.toLowerCase())) {
      console.log(`[MediaSync] Already inside project workspace for: "${projectName}"`);
      return true;
    }

    // 2. If currently inside a different project workspace, navigate back to gallery
    if (currentUrl.includes('/project/')) {
      console.log('[MediaSync] Navigating back to Flow gallery...');
      await page.goto('https://flow.google.com', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    // 3. Scroll progressively to find the card in the gallery (up to 12 scroll passes for 20+ projects)
    let found = false;
    for (let scrollPass = 0; scrollPass < 12; scrollPass++) {
      const exists = await page.evaluate((name) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if ((node.nodeValue || '').trim() === name.trim()) {
            return true;
          }
        }
        return false;
      }, projectName);

      if (exists) {
        found = true;
        break;
      }

      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(600);
    }

    // 4. Find the direct project URL from a.project-thumbnail-container on this card and navigate directly!
    const directUrl = await page.evaluate((name) => {
      const flowCards = Array.from(document.querySelectorAll('flow-project-card, .project-card, .projects-grid-item'));
      for (const card of flowCards) {
        const text = (card as HTMLElement).innerText || '';
        if (text.includes(name)) {
          const a = (card.querySelector('a.project-thumbnail-container') || card.querySelector('a[href*="/project/"]') || card.querySelector('a')) as HTMLAnchorElement | null;
          let href = a?.getAttribute('href') || a?.href || '';
          if (href) {
            return href.startsWith('http') ? href : `${window.location.origin}${href}`;
          }
        }
      }
      return null;
    }, projectName);

    if (directUrl) {
      console.log(`[MediaSync] Navigating directly to project URL: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const isProject = page.url().includes('/project/');
      console.log(`[MediaSync] Project "${projectName}" direct navigation result: ${isProject}, URL: ${page.url()}`);
      return isProject;
    }

    // Fallback: Click using Playwright locator on the card's thumbnail container
    const cardLoc = page.locator(`flow-project-card:has-text("${projectName}"), .project-card:has-text("${projectName}")`).first();
    if (await cardLoc.isVisible({ timeout: 2500 }).catch(() => false)) {
      await cardLoc.scrollIntoViewIfNeeded().catch(() => {});
      const link = cardLoc.locator('a.project-thumbnail-container, a[href*="/project/"], a').first();
      if (await link.isVisible().catch(() => false)) {
        await link.click({ force: true }).catch(() => {});
      } else {
        await cardLoc.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(4000);
    }

    // 5. Verify we entered the project workspace
    const entered = await page.evaluate(() => {
      const isProjectUrl = window.location.href.includes('/project/') || window.location.href.includes('project=');
      return isProjectUrl;
    }).catch(() => false);

    console.log(`[MediaSync] Project "${projectName}" entered: ${entered}, URL: ${page.url()}`);
    return entered;
  }

  public async sync(
    options: SyncMediaOptions,
    onProgress: (progress: SyncProgress) => void
  ): Promise<{ success: boolean; downloaded: number; skipped: number; message: string }> {
    this.isCancelled = false;

    // 1. Resolve session — handle null/undefined/empty string from IPC serialization
    const sessions = this.sessionManager.getSessions();
    const cleanSessionId = options.sessionId && options.sessionId.trim() ? options.sessionId.trim() : null;
    let targetSession = cleanSessionId ? this.sessionManager.getSessionById(cleanSessionId) : undefined;

    // Fallback if not found or empty: prioritize open browser > ready session > newest session
    if (!targetSession) {
      targetSession = sessions.find((s) => this.sessionManager.isBrowserOpen(s.id))
        || sessions.find((s) => s.status === 'ready')
        || (sessions.length > 0 ? sessions[sessions.length - 1] : undefined);
    }

    console.log(`[MediaSync] sync() — sessionId: "${options.sessionId}", resolved: "${targetSession?.name ?? 'none'} (${targetSession?.id ?? '-'})", browserOpen: ${targetSession ? this.sessionManager.isBrowserOpen(targetSession.id) : false}`);

    if (!targetSession) {
      const msg = 'Không tìm thấy phiên làm việc (Session) nào. Vui lòng tạo session và đăng nhập trước.';
      onProgress({ status: 'error', downloadedCount: 0, skippedCount: 0, totalFound: 0, message: msg });
      return { success: false, downloaded: 0, skipped: 0, message: msg };
    }

    if (!fs.existsSync(targetSession.profileDir)) {
      const msg = `Thư mục hồ sơ phiên không tồn tại: ${targetSession.profileDir}`;
      onProgress({ status: 'error', downloadedCount: 0, skippedCount: 0, totalFound: 0, message: msg });
      return { success: false, downloaded: 0, skipped: 0, message: msg };
    }

    onProgress({
      status: 'scanning',
      downloadedCount: 0,
      skippedCount: 0,
      totalFound: 0,
      message: `Đang khởi động trình duyệt đồng bộ với phiên: ${targetSession.name}...`,
    });

    let context: BrowserContext | null = null;
    let isOwnContext = false;
    let downloadedCount = 0;
    let skippedCount = 0;
    let totalFound = 0;

    try {
      const activeContext = this.sessionManager.getActiveContext(targetSession.id);
      if (activeContext) {
        console.log(`[MediaSync] Reusing already active browser context for session "${targetSession.name}"`);
        context = activeContext;
      } else {
        console.log(`[MediaSync] Launching persistent browser context for session "${targetSession.name}"...`);
        context = await chromium.launchPersistentContext(targetSession.profileDir, {
          headless: false,
          viewport: { width: 1440, height: 900 },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
        isOwnContext = true;
      }
      this.activeContext = context;

      const page = context.pages().length > 0 ? context.pages()[0] : (await context.newPage());
      page.setDefaultTimeout(35000);

      // If page is on blank, go to flow
      if (page.url() === 'about:blank') {
        const targetUrl = 'https://flow.google.com';
        console.log(`[MediaSync] Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }

      // Check if on marketing/landing page (e.g. /about)
      const currentUrl = page.url();
      if (currentUrl.includes('/about') || currentUrl === 'https://flow.google.com/' || currentUrl === 'https://flow.google.com') {
        for (const sel of [
          'button:has-text("Create with Google Flow")',
          'button:has-text("Tạo bằng Google Flow")',
          'a:has-text("Create with Google Flow")',
          'a:has-text("Tạo bằng Google Flow")',
          'button:has-text("Try in Google Flow")',
          'button:has-text("Get started")',
          'button:has-text("Bắt đầu")',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await btn.click().catch(() => {});
              await page.waitForTimeout(4000);
              break;
            }
          } catch {}
        }
      }

      if (this.isCancelled) throw new Error('Đã hủy đồng bộ');

      // Check if logged in
      const postLandingUrl = page.url();
      if (postLandingUrl.includes('accounts.google.com/signin') || postLandingUrl.includes('ServiceLogin')) {
        throw new Error('Phiên này chưa đăng nhập Google. Hãy mở Trình duyệt trong tab Cài đặt phiên để đăng nhập trước.');
      }

      // 2. Discover Projects
      interface ProjectTarget {
        name: string;
        url?: string;
      }

      const projectsToScan: ProjectTarget[] = [];

      if (options.scope === 'all_projects') {
        onProgress({
          status: 'scanning',
          downloadedCount: 0,
          skippedCount: 0,
          totalFound: 0,
          message: 'Đang quét danh sách các dự án trên Google Flow...',
        });

        // Check if project cards are already visible before navigating
        const hasVisibleCards = await page.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          return /Tháng\s*\d+/i.test(text) ||
            /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(text) ||
            /\b\d{1,2}:\d{2}\b/.test(text);
        }).catch(() => false);

        if (!hasVisibleCards) {
          // If currently inside a project workspace, navigate back to the gallery
          if (page.url().includes('/project/') || page.url().includes('/about') || page.url() === 'about:blank') {
            await page.goto('https://flow.google.com', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
            await page.waitForTimeout(3000);
          }
        }

        // Wait a moment for dynamic cards to hydrate
        await page.waitForTimeout(2000);

        // Progressive scrolling to trigger lazy loading of all 20+ project cards
        for (let scrollPass = 0; scrollPass < 8; scrollPass++) {
          await page.evaluate(() => {
            window.scrollBy(0, 900);
          });
          await page.waitForTimeout(600);
        }
        await page.evaluate(() => { window.scrollTo(0, 0); });
        await page.waitForTimeout(600);

        // Find project targets using enhanced multi-strategy discovery
        const discovered = await page.evaluate(() => {
          const items: { name: string; url?: string }[] = [];
          const seenUrls = new Set<string>();
          const seenNames = new Set<string>();

          const addItem = (name: string, url?: string) => {
            const cleanName = name
              .replace(/^Mở dự án\s*/i, '')
              .replace(/^Open project\s*/i, '')
              .replace(/^Mở\s*/i, '')
              .replace(/^Open\s*/i, '')
              .trim();
            if (!cleanName || cleanName.length < 2) return;
            const lower = cleanName.toLowerCase();
            const blacklist = [
              'overview', 'models', 'capabilities', 'tools', 'flow sessions', 'pricing',
              'sign in', 'đăng nhập', 'create with google flow', 'tạo bằng google flow',
              'get started', 'bắt đầu', 'new project', 'dự án mới', 'explore', 'khám phá',
              'faq', 'help', 'privacy', 'terms', 'google ai subscriptions', 'try in google flow'
            ];
            if (blacklist.includes(lower)) return;
            if (url && seenUrls.has(url)) return;
            if (seenNames.has(cleanName)) return;
            if (url) seenUrls.add(url);
            seenNames.add(cleanName);
            items.push({ name: cleanName, url });
          };

          // Strategy 0: Google Flow Angular components (<flow-project-card>, .project-card)
          const flowCards = Array.from(document.querySelectorAll('flow-project-card, .project-card, .projects-grid-item'));
          for (const card of flowCards) {
            const titleEl = card.querySelector('.project-title-label, .project-card-footer, [class*="title"], [class*="label"]');
            let name = (titleEl as HTMLElement)?.innerText?.trim() || '';
            if (name.includes('\n')) name = name.split('\n')[0].trim();

            if (!name) {
              const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
              let n: Node | null;
              while ((n = walker.nextNode())) {
                const val = (n.nodeValue || '').trim();
                if (/Tháng\s*\d+/i.test(val) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(val) || /\d{1,2}:\d{2}/.test(val)) {
                  name = val;
                  break;
                }
              }
            }

            const a = (card.querySelector('a.project-thumbnail-container') || card.querySelector('a[href*="/project/"]') || card.querySelector('a')) as HTMLAnchorElement | null;
            let href = a?.getAttribute('href') || a?.href || '';
            if (href && !href.startsWith('http')) {
              href = `${window.location.origin}${href}`;
            }

            if (name) {
              addItem(name, href || undefined);
            }
          }

          // Strategy 1: TreeWalker on all leaf text nodes (dates, times, project titles)
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let textNode: Node | null;
          while ((textNode = walker.nextNode())) {
            const val = (textNode.nodeValue || '').trim();
            if (!val || val.length < 3 || val.length > 80) continue;

            const isVietnameseDate = /Tháng\s*\d+/i.test(val);
            const isEnglishDate = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(val);
            const isTimePattern = /\b\d{1,2}:\d{2}\b/.test(val) && val.includes('-');
            const isProjectPattern = /^(?:Project|Dự án)\s+/i.test(val);

            if (isVietnameseDate || isEnglishDate || isTimePattern || isProjectPattern) {
              const parent = textNode.parentElement;
              if (!parent) continue;
              if (parent.closest('header, nav, footer, [role="tooltip"], [role="banner"], [role="dialog"], [data-testid*="user"]')) continue;

              const a = parent.closest('a') as HTMLAnchorElement | null;
              addItem(val, a?.href);
            }
          }

          // Strategy 2: Project card containers with thumbnail images
          const cardCandidates = Array.from(document.querySelectorAll(
            '[role="button"], [role="link"], [data-testid*="project"], [class*="card"], [class*="item"], [role="listitem"]'
          ));
          for (const card of cardCandidates) {
            if (card.closest('header, nav, footer, [role="banner"]')) continue;
            const hasThumbnail = card.querySelector('img, video, canvas, [style*="background-image"]');
            if (!hasThumbnail) continue;

            const cardText = (card as HTMLElement).innerText?.trim() || '';
            const lines = cardText.split('\n').map((l) => l.trim()).filter((l) => l.length > 2 && l.length < 80);
            for (const line of lines) {
              if (/Tháng\s*\d+/i.test(line) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i.test(line) || /\d{1,2}:\d{2}/.test(line) || /dự án/i.test(line) || /project/i.test(line)) {
                const a = card.closest('a') || card.querySelector('a');
                addItem(line, a ? a.href : undefined);
                break;
              }
            }
          }

          // Strategy 3: Anchor tags linking to projects
          const projectUrlPatterns = ['/project/', '/projects/', '/flow/project', '/flow/p/', '/fx/tools/flow/project', 'project=', '/shared/tool/'];
          const anchors = Array.from(document.querySelectorAll('a'));
          for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const hrefLow = href.toLowerCase();
            if (!projectUrlPatterns.some((p) => hrefLow.includes(p))) continue;
            const fullUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;
            const label = a.getAttribute('aria-label') || (a as HTMLElement).innerText?.trim() || '';
            if (label) addItem(label, fullUrl);
          }

          return items;
        });

        if (discovered.length > 0) {
          projectsToScan.push(...discovered);
        } else {
          // Fallback to current page
          projectsToScan.push({
            name: options.targetProjectName || 'FlowStudioProject',
            url: page.url(),
          });
        }

        // Filter to only selectedProjectNames if specified
        if (options.selectedProjectNames && options.selectedProjectNames.length > 0) {
          const allowed = new Set(options.selectedProjectNames);
          const filtered = projectsToScan.filter((p) => allowed.has(p.name));
          projectsToScan.length = 0;
          projectsToScan.push(...filtered);
          if (projectsToScan.length === 0) {
            // Fallback: just use all discovered if filter matched nothing
            projectsToScan.push(...discovered);
          }
        }
      } else {
        // Current or specified project
        projectsToScan.push({
          name: options.targetProjectName || 'FlowStudioProject',
          url: page.url(),
        });
      }

      console.log(`[MediaSync] Found ${projectsToScan.length} project(s) to scan:`, projectsToScan.map((p) => p.name));

      // 3. Scan & Download Media per Project
      for (let pIdx = 0; pIdx < projectsToScan.length; pIdx++) {
        if (this.isCancelled) break;

        const proj = projectsToScan[pIdx];
        const projectName = BatchNamer.sanitize(proj.name || options.targetProjectName || 'FlowStudioProject');
        const { imagesDir, metadataDir } = this.outputManager.getProjectDirs(projectName);

        onProgress({
          status: 'scanning',
          currentProject: projectName,
          downloadedCount,
          skippedCount,
          totalFound,
          message: `Đang quét ảnh trong dự án "${proj.name}" (${pIdx + 1}/${projectsToScan.length})...`,
        });

        // Navigate or click into project
        let enteredProject = false;
        if (proj.url && page.url() !== proj.url) {
          await page.goto(proj.url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);
          enteredProject = true;
        } else {
          enteredProject = await this.enterProjectCard(page, proj.name);
        }

        // CRITICAL GUARD: Ensure we are NOT on the gallery page with multiple project cards!
        // If we are still on the gallery page, extracting images would download thumbnails of ALL projects!
        const isStillOnGallery = await page.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          const matchCount = (text.match(/Tháng\s*\d+|\b\d{1,2}:\d{2}\b/g) || []).length;
          return matchCount >= 4;
        }).catch(() => false);

        if (isStillOnGallery) {
          console.warn(`[MediaSync] Still on gallery page! Skipping media extraction for "${proj.name}" to prevent downloading other projects' thumbnails.`);
          onProgress({
            status: 'scanning',
            currentProject: projectName,
            downloadedCount,
            skippedCount,
            totalFound,
            message: `[${proj.name}] Không thể mở trang dự án này, bỏ qua để tránh tải nhầm thumbnail các dự án khác.`,
          });
          continue;
        }

        // Inside the project workspace: scroll through the CDK virtual scroll container to collect ALL generated images
        await page.waitForTimeout(2000);

        const scrollInfo = await page.evaluate(() => {
          const scroller =
            document.querySelector('.cdk-virtual-scrollable') ||
            document.querySelector('[class*="virtual-scroll"]') ||
            document.querySelector('[class*="page-container"]') ||
            document.documentElement;
          return {
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
          };
        }).catch(() => ({ scrollHeight: 1000, clientHeight: 700 }));

        const stepSize = Math.max(350, Math.floor(scrollInfo.clientHeight * 0.7));
        const seenMedia = new Map<string, { src: string; prompt: string; width: number; height: number; globalY: number; globalX: number }>();

        for (let pos = 0; pos <= scrollInfo.scrollHeight + stepSize; pos += stepSize) {
          if (this.isCancelled) break;

          const batch = await page.evaluate((targetPos) => {
            const scroller =
              document.querySelector('.cdk-virtual-scrollable') ||
              document.querySelector('[class*="virtual-scroll"]') ||
              document.querySelector('[class*="page-container"]') ||
              document.documentElement;
            scroller.scrollTop = targetPos;
            window.scrollTo(0, targetPos);

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
                src.includes('=s128') ||
                src.includes('/website/') ||
                src.includes('/landing_page/') ||
                src.includes('landing_video') ||
                src.includes('about') ||
                src.includes('favicon')
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
              return isFlow || (rect.width >= 120 && rect.height >= 120) || (img.naturalWidth >= 120 && img.naturalHeight >= 120);
            });

            return imgs.map((img) => {
              const rect = img.getBoundingClientRect();
              return {
                src: img.src,
                globalY: Math.round(rect.top + scroller.scrollTop),
                globalX: Math.round(rect.left),
                prompt: img.getAttribute('alt') || img.getAttribute('aria-label') || '',
                width: img.naturalWidth || img.clientWidth || 0,
                height: img.naturalHeight || img.clientHeight || 0,
              };
            });
          }, pos).catch(() => []);

          for (const item of batch) {
            if (item.src && !seenMedia.has(item.src)) {
              seenMedia.set(item.src, item);
            }
          }

          onProgress({
            status: 'scanning',
            currentProject: projectName,
            downloadedCount,
            skippedCount,
            totalFound: seenMedia.size,
            message: `[${proj.name}] Đang quét tất cả ảnh (${seenMedia.size} ảnh tìm thấy)...`,
          });

          await page.waitForTimeout(140);
        }

        // Sort from Oldest (at bottom of web feed) to Newest (at top of web feed)
        // User requirement:
        // 1. Bottom-to-top: "hình đầu tiên bạn phải cuộn hết xuống, còn hình cuối cùng là nó nằm ở trên cùng khi bạn mới vào"
        //    -> globalY DESCENDING: largest Y (bottom of page) comes first (Oldest / Start of project)
        // 2. Right-to-left: "ưu tiên bên phải trước, bên phải có thì lấy rồi qua bên trái"
        //    -> For items in same row (|globalY diff| <= 50), globalX DESCENDING: right tile comes before left tile
        const mediaItems = Array.from(seenMedia.values()).sort((a, b) => {
          if (Math.abs(a.globalY - b.globalY) > 50) {
            return b.globalY - a.globalY;
          }
          return b.globalX - a.globalX; // Right to Left
        });

        console.log(`[MediaSync] Project "${proj.name}" scanned ${mediaItems.length} images. First item at bottom (Y=${mediaItems[0]?.globalY}), last item at top (Y=${mediaItems[mediaItems.length - 1]?.globalY})`);

        totalFound += mediaItems.length;

        // Build a set of existing URL hashes or file signatures already in metadataDir
        const existingHashes = new Set<string>();
        if (fs.existsSync(metadataDir)) {
          const metaFiles = fs.readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
          for (const mf of metaFiles) {
            try {
              const metaContent = JSON.parse(fs.readFileSync(path.join(metadataDir, mf), 'utf-8'));
              if (metaContent.sourceUrlHash) existingHashes.add(metaContent.sourceUrlHash);
              if (metaContent.sourceUrl) existingHashes.add(metaContent.sourceUrl);
            } catch {}
          }
        }

        // Process downloads
        for (let idx = 0; idx < mediaItems.length; idx++) {
          if (this.isCancelled) break;

          const item = mediaItems[idx];
          const urlHash = this.hashUrl(item.src);

          // Check if already downloaded
          if (existingHashes.has(urlHash) || existingHashes.has(item.src)) {
            skippedCount++;
            continue;
          }

          // Format filename using BatchNamer
          const ext = item.src.includes('.webp') ? '.webp' : '.png';
          const candidateName = BatchNamer.formatFilename({
            config: options.namingConfig,
            projectName,
            index: downloadedCount,
            extension: ext,
          });

          const { filePath, filename } = BatchNamer.getUniqueFilePath(imagesDir, candidateName);

          onProgress({
            status: 'downloading',
            currentProject: projectName,
            currentFile: filename,
            downloadedCount,
            skippedCount,
            totalFound,
            message: `[${projectName}] Đang tải: ${filename} (${downloadedCount + 1})...`,
          });

          try {
            // Prefer full-resolution URL for Googleusercontent if available
            let targetSrc = item.src;
            if (targetSrc.includes('googleusercontent.com') && (targetSrc.includes('=w') || targetSrc.includes('=s'))) {
              targetSrc = targetSrc.replace(/=w\d+-h\d+.*$/, '=s0').replace(/=s\d+.*$/, '=s0');
            }

            let resp = await page.request.get(targetSrc).catch(() => null);
            if (!resp || !resp.ok()) {
              resp = await page.request.get(item.src).catch(() => null);
            }

            if (resp && resp.ok()) {
              const buf = await resp.body();
              if (buf.length >= 2048) {
                // Save image file
                fs.writeFileSync(filePath, buf);

                // Save metadata file
                const baseName = path.parse(filename).name;
                const metaPath = path.join(metadataDir, `${baseName}.json`);
                const metadata = {
                  jobId: `sync_${urlHash}`,
                  name: filename,
                  type: 'image',
                  provider: 'nano_banana',
                  prompt: item.prompt || 'Ảnh đồng bộ từ Google Flow',
                  outputFile: filePath,
                  sourceUrl: item.src,
                  sourceUrlHash: urlHash,
                  projectName,
                  syncedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                };
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

                existingHashes.add(urlHash);
                downloadedCount++;
              } else {
                skippedCount++;
              }
            } else {
              skippedCount++;
            }
          } catch (dlErr) {
            console.warn(`[MediaSync] Failed to download image ${item.src}:`, dlErr);
            skippedCount++;
          }
        }

        // If there are more projects to scan, navigate back to gallery
        if (pIdx < projectsToScan.length - 1) {
          console.log('[MediaSync] Navigating back to Flow gallery for next project...');
          await page.goto('https://flow.google.com', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);
        }
      }

      if (this.isCancelled) {
        onProgress({
          status: 'cancelled',
          downloadedCount,
          skippedCount,
          totalFound,
          message: 'Đã hủy quá trình đồng bộ.',
        });
        return { success: false, downloaded: downloadedCount, skipped: skippedCount, message: 'Đã hủy đồng bộ' };
      }

      const successMsg = `Đã đồng bộ xong! Tải mới: ${downloadedCount} ảnh, Bỏ qua trùng lặp: ${skippedCount} ảnh (Tổng phát hiện: ${totalFound}).`;
      onProgress({
        status: 'completed',
        downloadedCount,
        skippedCount,
        totalFound,
        message: successMsg,
      });

      return {
        success: true,
        downloaded: downloadedCount,
        skipped: skippedCount,
        message: successMsg,
      };
    } catch (err: any) {
      console.error('[MediaSync] Sync error:', err);
      const errMsg = `Lỗi đồng bộ: ${err.message || String(err)}`;
      onProgress({
        status: 'error',
        downloadedCount,
        skippedCount,
        totalFound,
        message: errMsg,
      });
      return { success: false, downloaded: downloadedCount, skipped: skippedCount, message: errMsg };
    } finally {
      if (isOwnContext && context) {
        await context.close().catch(() => {});
      }
      this.activeContext = null;
    }
  }
}
