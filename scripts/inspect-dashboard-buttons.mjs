import { chromium } from 'playwright';

const profileDir = 'C:\\Users\\canthai\\AppData\\Roaming\\flow-studio-automation\\sessions\\sess_1792748960366_gx5l';

async function test() {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://flow.google.com', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(4000);
  console.log('Dashboard URL:', page.url());

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a')).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      aria: el.getAttribute('aria-label') || '',
      className: el.className,
      href: el.getAttribute('href') || ''
    })).filter(x => x.text || x.aria || x.href);
  });

  console.log('--- ALL BUTTONS AND LINKS ON DASHBOARD ---');
  for (const b of buttons) {
    if (b.text.includes('Dự án') || b.text.includes('Project') || b.text.includes('Tạo') || b.aria.includes('Dự án') || b.aria.includes('Project') || b.aria.includes('Tạo') || b.text.includes('+') || b.href.includes('project')) {
      console.log(`[${b.tag}] text="${b.text}" aria="${b.aria}" href="${b.href}" class="${b.className}"`);
    }
  }

  await context.close();
}

test().catch(console.error);
