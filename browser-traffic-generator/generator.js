/**
 * Browser Traffic Generator — Creates real Dynatrace RUM sessions
 *
 * Uses Playwright (headless Chromium) to navigate the actual web UI.
 * The browser executes the Dynatrace JS agent injected by OneAgent,
 * generating genuine user sessions with page actions, clicks, and XHR tracking.
 *
 * AGENT: Update NAV_TABS, LOGIN logic, and navigation selectors to match
 *        the customized UI after industry.yaml mutation.
 *
 * Environment variables:
 *   APP_URL                  - Base URL (default: http://web-ui:80)
 *   CONCURRENT_USERS         - Parallel browser sessions (default: 3)
 *   NAVIGATIONS_PER_SESSION  - Pages per session (default: 10)
 *   SESSION_INTERVAL         - Seconds between sessions (default: 60)
 *   NAV_SELECTOR             - CSS selector for navigation elements
 *   LOGIN_USER_SELECTOR      - CSS selector for username input
 *   LOGIN_PASS_SELECTOR      - CSS selector for password input
 *   LOGIN_SUBMIT_SELECTOR    - CSS selector for login button
 *   LOGIN_USERNAME           - Username (default: random from DEMO_USERS)
 *   LOGIN_PASSWORD           - Password (default: changeme2026)
 *   LOGOUT_SELECTOR          - CSS selector for logout button
 */

const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://web-ui:80';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '3', 10);
const SESSION_INTERVAL = parseInt(process.env.SESSION_INTERVAL || '60', 10) * 1000;
const NAVIGATIONS = parseInt(process.env.NAVIGATIONS_PER_SESSION || '10', 10);

// Navigation element selector (tabs, links, buttons)
// AGENT: Update to match the customized UI's navigation elements
const NAV_SELECTOR = process.env.NAV_SELECTOR || "[role='tab'], nav a, .MuiTab-root";

// Login configuration
// AGENT: Update selectors to match the customized UI's login form
const LOGIN_USER_SELECTOR = process.env.LOGIN_USER_SELECTOR || "[role='combobox'], .MuiSelect-select, #user-select";
const LOGIN_PASS_SELECTOR = process.env.LOGIN_PASS_SELECTOR || '';
const LOGIN_SUBMIT_SELECTOR = process.env.LOGIN_SUBMIT_SELECTOR || "button:has-text('Login'), button[type='submit']";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'changeme2026';
const LOGOUT_SELECTOR = process.env.LOGOUT_SELECTOR || "button:has-text('Logout')";

// AGENT: Update demo_users to match industry.yaml demo_users
const DEMO_USERS = [
  'admin_user', 'manager_north', 'manager_south',
  'operator_1', 'operator_2', 'operator_3', 'operator_4', 'operator_5',
  'viewer_1', 'viewer_2', 'viewer_3', 'viewer_4', 'viewer_5', 'viewer_6', 'viewer_7',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomSleep(minS, maxS) { return sleep((minS + Math.random() * (maxS - minS)) * 1000); }

// ---- Browser session ----
async function runSession(browser, slotId) {
  const username = process.env.LOGIN_USERNAME || pick(DEMO_USERS);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    userAgent: pick(USER_AGENTS),
  });
  const page = await context.newPage();

  try {
    console.log(`[Slot ${slotId}] Session start — user: ${username}`);

    // 1. Navigate to app — triggers DT JS agent injection
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await randomSleep(2, 4);

    // 2. Login — select user from dropdown or fill input
    const selectEl = page.locator(LOGIN_USER_SELECTOR).first();
    if (await selectEl.isVisible().catch(() => false)) {
      // Material UI Select dropdown
      await selectEl.click();
      await randomSleep(0.3, 0.8);
      const option = page.locator(`[role="option"]:has-text("${username}"), li:has-text("${username}")`);
      if (await option.first().isVisible().catch(() => false)) {
        await option.first().click();
      } else {
        await page.locator(`[role="listbox"] >> text=${username}`).click().catch(() => {});
      }
      await randomSleep(0.5, 1);
    } else {
      // Standard text input
      const userInput = page.locator('input[name="username"], #username, input[type="text"]').first();
      if (await userInput.isVisible().catch(() => false)) {
        await userInput.fill(username);
        if (LOGIN_PASS_SELECTOR) {
          await page.fill(LOGIN_PASS_SELECTOR, LOGIN_PASSWORD);
        }
        await randomSleep(0.5, 1);
      }
    }

    // Click login button
    const loginBtn = page.locator(LOGIN_SUBMIT_SELECTOR).first();
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
      await randomSleep(2, 4);
    }

    // 3. Navigate through tabs/pages
    for (let i = 0; i < NAVIGATIONS; i++) {
      const navItems = page.locator(NAV_SELECTOR);
      const count = await navItems.count();
      if (count === 0) {
        console.log(`[Slot ${slotId}]   No nav elements found, waiting...`);
        await randomSleep(3, 5);
        continue;
      }
      const idx = Math.floor(Math.random() * count);
      const label = await navItems.nth(idx).textContent().catch(() => `tab-${idx}`);
      console.log(`[Slot ${slotId}]   nav ${i + 1}/${NAVIGATIONS}: "${(label || '').trim()}"`);

      await navItems.nth(idx).click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await randomSleep(3, 8);

      // Scroll activity on every other page
      if (i % 2 === 0) {
        await page.evaluate(() => window.scrollBy(0, 300));
        await randomSleep(1, 2);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }

    // 4. Logout
    const logoutBtn = page.locator(LOGOUT_SELECTOR).first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await randomSleep(1, 2);
    }

    console.log(`[Slot ${slotId}] Session end — ${NAVIGATIONS} pages visited`);
  } catch (err) {
    console.error(`[Slot ${slotId}] Error:`, err.message);
  } finally {
    await context.close();
  }
}

// ---- Session loop per slot ----
async function sessionLoop(browser, slotId) {
  while (true) {
    await runSession(browser, slotId);
    const jitter = SESSION_INTERVAL * (0.5 + Math.random());
    console.log(`[Slot ${slotId}] Next session in ${Math.round(jitter / 1000)}s`);
    await sleep(jitter);
  }
}

// ---- Main ----
async function main() {
  console.log(`=== Browser Traffic Generator ===`);
  console.log(`URL: ${APP_URL}`);
  console.log(`Users: ${CONCURRENT_USERS} | Navs/session: ${NAVIGATIONS} | Interval: ${SESSION_INTERVAL / 1000}s`);
  console.log(`================================`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  console.log(`Browser launched (Chromium ${browser.version()})`);

  const slots = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    slots.push(sleep(i * 5000).then(() => sessionLoop(browser, i + 1)));
  }

  await Promise.all(slots);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
