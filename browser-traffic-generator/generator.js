/**
 * Browser Traffic Generator — Creates real Dynatrace RUM sessions
 *
 * Uses Playwright (headless Chromium) to simulate realistic user personas.
 * Each persona follows role-based journeys with drill-downs, table clicks,
 * filters, and cross-links — generating rich RUM data.
 * Sessions are limited to MAX_SESSION_MINUTES (default: 10).
 *
 * AGENT: Update PERSONAS, JOURNEYS, and NAV selectors to match
 *        the customized UI after industry.yaml mutation.
 *
 * Environment variables:
 *   APP_URL                  - Base URL (default: http://web-ui:80)
 *   CONCURRENT_USERS         - Parallel browser sessions (default: 3)
 *   SESSION_INTERVAL         - Seconds between sessions (default: 60)
 *   MAX_SESSION_MINUTES      - Max duration per session in minutes (default: 10)
 *   NAV_SELECTOR             - CSS selector for navigation elements
 *   LOGIN_USER_SELECTOR      - CSS selector for username input/select
 *   LOGIN_SUBMIT_SELECTOR    - CSS selector for login button
 *   LOGIN_PASSWORD           - Password (default: changeme2026)
 *   LOGOUT_SELECTOR          - CSS selector for logout button
 */

const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://web-ui:80';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '3', 10);
const SESSION_INTERVAL = parseInt(process.env.SESSION_INTERVAL || '60', 10) * 1000;
const MAX_SESSION_MS = parseInt(process.env.MAX_SESSION_MINUTES || '10', 10) * 60 * 1000;

// Navigation element selector — AGENT: update to match customized UI
const NAV_SELECTOR = process.env.NAV_SELECTOR || "[role='tab'], nav a, .MuiTab-root";

// Login selectors — AGENT: update to match customized UI login form
const LOGIN_USER_SELECTOR = process.env.LOGIN_USER_SELECTOR || "[role='combobox'], .MuiSelect-select, #user-select";
const LOGIN_SUBMIT_SELECTOR = process.env.LOGIN_SUBMIT_SELECTOR || "button:has-text('Login'), button[type='submit']";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'changeme2026';
const LOGOUT_SELECTOR = process.env.LOGOUT_SELECTOR || "button:has-text('Logout')";

// ============================================================
// AGENT: Update PERSONAS to match industry.yaml demo_users and roles
// Weight controls selection probability (higher = more sessions)
// ============================================================
const PERSONAS = [
  { username: 'admin_user',     role: 'admin',    region: 'region-1', journeys: ['executive_overview', 'audit_review', 'analytics_review'],   weight: 1 },
  { username: 'manager_north',  role: 'manager',  region: 'region-1', journeys: ['executive_overview', 'analytics_review', 'incident_triage'], weight: 2 },
  { username: 'manager_south',  role: 'manager',  region: 'region-2', journeys: ['executive_overview', 'dispatch_ops', 'analytics_review'],    weight: 2 },
  { username: 'operator_1',     role: 'operator', region: 'region-1', journeys: ['incident_triage', 'routine_monitoring', 'telemetry_check'],  weight: 3 },
  { username: 'operator_2',     role: 'operator', region: 'region-2', journeys: ['incident_triage', 'dispatch_ops', 'routine_monitoring'],     weight: 3 },
  { username: 'operator_3',     role: 'operator', region: 'region-3', journeys: ['routine_monitoring', 'telemetry_check', 'incident_triage'],  weight: 3 },
  { username: 'operator_4',     role: 'operator', region: 'region-4', journeys: ['dispatch_ops', 'incident_triage', 'workorder_mgmt'],         weight: 2 },
  { username: 'operator_5',     role: 'operator', region: 'region-5', journeys: ['telemetry_check', 'routine_monitoring', 'dispatch_ops'],     weight: 2 },
  { username: 'viewer_1',       role: 'viewer',   region: 'region-1', journeys: ['executive_overview', 'analytics_review'],                    weight: 1 },
  { username: 'viewer_2',       role: 'viewer',   region: 'region-2', journeys: ['routine_monitoring', 'analytics_review'],                    weight: 1 },
  { username: 'viewer_3',       role: 'viewer',   region: 'region-3', journeys: ['executive_overview', 'pricing_review'],                      weight: 1 },
  { username: 'viewer_4',       role: 'viewer',   region: 'region-4', journeys: ['analytics_review', 'forecast_review'],                       weight: 1 },
  { username: 'viewer_5',       role: 'viewer',   region: 'region-5', journeys: ['routine_monitoring', 'audit_review'],                        weight: 1 },
  { username: 'viewer_6',       role: 'viewer',   region: 'region-1', journeys: ['executive_overview', 'incident_triage'],                     weight: 1 },
  { username: 'viewer_7',       role: 'viewer',   region: 'region-2', journeys: ['analytics_review', 'routine_monitoring'],                    weight: 1 },
];

// ============================================================
// AGENT: Update JOURNEYS to match customized UI tabs and workflows
// Action types: nav (click tab), w (wait), scroll, row (click table row),
//               back (click back), fsel (select filter), kpi (click KPI card),
//               search (use global search), click (click arbitrary selector)
// ============================================================
const JOURNEYS = {
  incident_triage: [
    { t: 'nav', idx: 1 },  // Incidents tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
    { t: 'scroll' },
    { t: 'nav', idx: 7 },  // Dispatch tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 3, b: 6 },
    { t: 'nav', idx: 8 },  // Notifications tab
    { t: 'w', a: 2, b: 4 },
    { t: 'nav', idx: 13 }, // Correlation tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
  ],
  routine_monitoring: [
    { t: 'nav', idx: 0 },  // Dashboard tab
    { t: 'w', a: 5, b: 10 },
    { t: 'scroll' },
    { t: 'nav', idx: 3 },  // Telemetry tab
    { t: 'w', a: 3, b: 6 },
    { t: 'row' },
    { t: 'w', a: 3, b: 6 },
    { t: 'nav', idx: 2 },  // Readings tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 0 },  // Back to Dashboard
    { t: 'w', a: 2, b: 4 },
  ],
  telemetry_check: [
    { t: 'nav', idx: 3 },  // Telemetry tab
    { t: 'w', a: 3, b: 6 },
    { t: 'row' },
    { t: 'w', a: 5, b: 10 },
    { t: 'scroll' },
    { t: 'nav', idx: 13 }, // Correlation tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 3 },  // Back to Telemetry
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
  ],
  dispatch_ops: [
    { t: 'nav', idx: 7 },  // Dispatch tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
    { t: 'nav', idx: 1 },  // Incidents tab
    { t: 'w', a: 2, b: 4 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
    { t: 'nav', idx: 7 },  // Back to Dispatch
    { t: 'w', a: 2, b: 5 },
    { t: 'scroll' },
    { t: 'nav', idx: 8 },  // Notifications tab
    { t: 'w', a: 2, b: 4 },
  ],
  executive_overview: [
    { t: 'nav', idx: 0 },  // Dashboard tab
    { t: 'w', a: 5, b: 10 },
    { t: 'scroll' },
    { t: 'w', a: 3, b: 6 },
    { t: 'nav', idx: 5 },  // Analytics tab
    { t: 'w', a: 3, b: 6 },
    { t: 'nav', idx: 6 },  // Forecasts tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 10 }, // Aggregation tab
    { t: 'w', a: 2, b: 4 },
    { t: 'nav', idx: 0 },  // Back to Dashboard
    { t: 'w', a: 3, b: 6 },
  ],
  analytics_review: [
    { t: 'nav', idx: 5 },  // Analytics tab
    { t: 'w', a: 3, b: 8 },
    { t: 'scroll' },
    { t: 'nav', idx: 0 },  // Dashboard tab
    { t: 'w', a: 2, b: 4 },
    { t: 'nav', idx: 1 },  // Incidents tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
    { t: 'nav', idx: 6 },  // Forecasts tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 5 },  // Back to Analytics
    { t: 'w', a: 2, b: 4 },
  ],
  forecast_review: [
    { t: 'nav', idx: 6 },  // Forecasts tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 0 },  // Dashboard tab
    { t: 'w', a: 3, b: 6 },
    { t: 'nav', idx: 9 },  // External Data tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 6 },  // Back to Forecasts
    { t: 'w', a: 2, b: 4 },
  ],
  workorder_mgmt: [
    { t: 'nav', idx: 12 }, // Work Orders tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 5, b: 10 },
    { t: 'nav', idx: 12 }, // Stay on Work Orders
    { t: 'w', a: 2, b: 4 },
    { t: 'nav', idx: 14 }, // Audit Log tab
    { t: 'w', a: 2, b: 5 },
    { t: 'scroll' },
  ],
  pricing_review: [
    { t: 'nav', idx: 11 }, // Pricing tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 2 },  // Readings tab
    { t: 'w', a: 2, b: 5 },
    { t: 'row' },
    { t: 'w', a: 4, b: 8 },
  ],
  audit_review: [
    { t: 'nav', idx: 14 }, // Audit Log tab
    { t: 'w', a: 3, b: 6 },
    { t: 'scroll' },
    { t: 'nav', idx: 15 }, // Users tab
    { t: 'w', a: 2, b: 4 },
    { t: 'nav', idx: 0 },  // Dashboard tab
    { t: 'w', a: 3, b: 6 },
  ],
};

const DEPARTMENTS = {
  admin: 'Administration', manager: 'Management', operator: 'Operations', viewer: 'Monitoring'
};
const SHIFTS = ['Day', 'Night', 'Swing', 'Overnight'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 },
  { width: 2560, height: 1440 }, { width: 1280, height: 720 },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rSleep(a, b) { return sleep((a + Math.random() * (b - a)) * 1000); }
function timeLeft(start) { return (Date.now() - start) < MAX_SESSION_MS; }
function pickPersona() {
  const expanded = [];
  PERSONAS.forEach(p => { for (let i = 0; i < p.weight; i++) expanded.push(p); });
  return pick(expanded);
}

// ---- Execute a single journey action ----
async function exec(page, action, slotId, start) {
  if (!timeLeft(start)) return false;
  try {
    switch (action.t) {
      case 'nav': {
        const tabs = page.locator(NAV_SELECTOR);
        const count = await tabs.count();
        const idx = typeof action.idx === 'number' ? action.idx : Math.floor(Math.random() * count);
        if (idx < count) {
          const label = await tabs.nth(idx).textContent().catch(() => `tab-${idx}`);
          await tabs.nth(idx).click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
          console.log(`[${slotId}] nav: "${(label || '').trim()}"`);
        }
        break;
      }
      case 'w': await rSleep(action.a, action.b); break;
      case 'scroll':
        await page.evaluate(() => window.scrollBy(0, Math.random() * 400 + 100));
        await rSleep(0.5, 1.5);
        await page.evaluate(() => window.scrollTo(0, 0));
        break;
      case 'row': {
        const rows = page.locator('table tbody tr, .MuiTableRow-root');
        const count = await rows.count().catch(() => 0);
        if (count > 0) {
          const idx = Math.floor(Math.random() * Math.min(count, 5));
          await rows.nth(idx).click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
          console.log(`[${slotId}] row: ${idx}`);
        }
        break;
      }
      case 'click': {
        const el = page.locator(action.sel);
        if (await el.first().isVisible().catch(() => false)) {
          await el.first().click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        break;
      }
      case 'back': {
        const btn = page.locator("button:has-text('Back'), .breadcrumb a, button:has-text('Refresh')").first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        break;
      }
      case 'fsel': {
        const selects = page.locator('select, .MuiSelect-select');
        const count = await selects.count().catch(() => 0);
        if (count > 0) {
          await selects.first().selectOption(action.v).catch(() => {});
          await rSleep(0.5, 1);
          console.log(`[${slotId}] filter: ${action.v}`);
        }
        break;
      }
      case 'search': {
        const input = page.locator('input[type="search"], #search-input, input[placeholder*="Search"]');
        if (await input.first().isVisible().catch(() => false)) {
          await input.first().fill(action.q);
          await rSleep(1, 2);
          console.log(`[${slotId}] search: "${action.q}"`);
        }
        break;
      }
    }
  } catch (e) {}
  return timeLeft(start);
}

// ---- Run a full session for a persona ----
async function runSession(browser, slotId) {
  const persona = pickPersona();
  const start = Date.now();
  const sessionIp = `10.${50 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: pick(VIEWPORTS),
    userAgent: pick(USER_AGENTS),
    extraHTTPHeaders: { 'X-Forwarded-For': sessionIp, 'X-Real-IP': sessionIp }
  });
  const page = await context.newPage();
  let actions = 0;

  try {
    console.log(`[${slotId}] START ${persona.username} (${persona.role})`);

    // 1. Navigate to app
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await rSleep(2, 4);

    // 2. Login
    const selectEl = page.locator(LOGIN_USER_SELECTOR).first();
    if (await selectEl.isVisible().catch(() => false)) {
      await selectEl.click();
      await rSleep(0.3, 0.8);
      const option = page.locator(`[role="option"]:has-text("${persona.username}"), li:has-text("${persona.username}")`);
      if (await option.first().isVisible().catch(() => false)) {
        await option.first().click();
      } else {
        await page.locator(`[role="listbox"] >> text=${persona.username}`).click().catch(() => {});
      }
      await rSleep(0.5, 1);
    } else {
      const userInput = page.locator('input[name="username"], #username, input[type="text"]').first();
      if (await userInput.isVisible().catch(() => false)) {
        await userInput.fill(persona.username);
        await rSleep(0.5, 1);
      }
    }
    const loginBtn = page.locator(LOGIN_SUBMIT_SELECTOR).first();
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
      await rSleep(2, 4);
    }

    // 3. Wait for Dynatrace RUM agent and identify user
    await page.waitForFunction(() => typeof dtrum !== 'undefined' && typeof dtrum.identifyUser === 'function', { timeout: 10000 }).catch(() => {});
    await page.evaluate(u => { if (typeof dtrum !== 'undefined' && dtrum.identifyUser) dtrum.identifyUser(u); }, persona.username).catch(() => {});

    // Send rich session properties
    const shift = pick(SHIFTS);
    const dept = DEPARTMENTS[persona.role] || 'Operations';
    await page.evaluate(({ role, region, shift, dept, username }) => {
      if (typeof dtrum === 'undefined' || !dtrum.sendSessionProperties) return;
      dtrum.sendSessionProperties(
        { session_number: Math.floor(Math.random() * 500) + 1, login_hour: new Date().getHours() },
        { screen_dpi: window.devicePixelRatio || 1.0 },
        { role, region, department: dept, shift_type: shift, user_name: username, app_version: '2.0.0', browser_lang: navigator.language || 'en-US' }
      );
    }, { role: persona.role, region: persona.region, shift, dept, username: persona.username }).catch(() => {});

    // 4. Execute 2-3 journeys per session
    let journeyCount = 0;
    const numJourneys = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numJourneys && timeLeft(start); j++) {
      const journeyName = pick(persona.journeys);
      const journey = JOURNEYS[journeyName];
      if (!journey) continue;

      console.log(`[${slotId}] journey: ${journeyName} (${journey.length} steps)`);

      // Start custom user action for this journey
      const jActionId = await page.evaluate(n => {
        if (typeof dtrum !== 'undefined' && dtrum.enterAction) return dtrum.enterAction('Journey - ' + n);
        return null;
      }, journeyName).catch(() => null);

      for (const action of journey) {
        if (!timeLeft(start)) break;

        // Wrap significant steps in custom user actions
        let stepActionId = null;
        if (['nav', 'row', 'search', 'click', 'fsel'].includes(action.t)) {
          const stepName = action.t === 'nav' ? 'Navigate Tab' : action.t === 'row' ? 'View Detail Row' :
            action.t === 'search' ? `Search "${action.q}"` : action.t === 'fsel' ? 'Filter Select' : 'Click Action';
          stepActionId = await page.evaluate(n => {
            if (typeof dtrum !== 'undefined' && dtrum.enterAction) return dtrum.enterAction(n);
            return null;
          }, stepName).catch(() => null);
        }

        const ok = await exec(page, action, slotId, start);

        if (stepActionId) {
          await page.evaluate(id => { if (typeof dtrum !== 'undefined' && dtrum.leaveAction && id) dtrum.leaveAction(id); }, stepActionId).catch(() => {});
        }

        if (action.t !== 'w') { actions++; }

        // Simulate occasional errors (~5%) for realistic RUM error data
        if (action.t !== 'w' && Math.random() < 0.05) {
          await page.evaluate(() => {
            if (typeof dtrum !== 'undefined' && dtrum.reportError) dtrum.reportError('Slow response detected');
          }).catch(() => {});
        }

        if (!ok) break;
      }

      // Close journey action
      if (jActionId) {
        await page.evaluate(id => { if (typeof dtrum !== 'undefined' && dtrum.leaveAction && id) dtrum.leaveAction(id); }, jActionId).catch(() => {});
      }
      journeyCount++;

      // Send journey metrics
      const elapsed = Math.round((Date.now() - start) / 1000);
      await page.evaluate(({ jc, ac, dur, jn }) => {
        if (typeof dtrum === 'undefined' || !dtrum.sendSessionProperties) return;
        dtrum.sendSessionProperties(
          { journeys_completed: jc, total_actions: ac, session_duration_sec: dur },
          { avg_actions_per_journey: ac / Math.max(jc, 1) },
          { last_journey: jn }
        );
      }, { jc: journeyCount, ac: actions, dur: elapsed, jn: journeyName }).catch(() => {});

      if (timeLeft(start)) await rSleep(3, 8);
    }

    // 5. Logout
    const logoutBtn = page.locator(LOGOUT_SELECTOR).first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await rSleep(1, 2);
    }

    // Send final session summary
    const totalDuration = Math.round((Date.now() - start) / 1000);
    await page.evaluate(({ jc, ac, dur }) => {
      if (typeof dtrum === 'undefined' || !dtrum.sendSessionProperties) return;
      dtrum.sendSessionProperties(
        { journeys_completed: jc, total_actions: ac, session_duration_sec: dur },
        { actions_per_minute: dur > 0 ? (ac / (dur / 60)) : 0 },
        { session_outcome: ac > 15 ? 'productive' : ac > 5 ? 'moderate' : 'brief' }
      );
    }, { jc: journeyCount, ac: actions, dur: totalDuration }).catch(() => {});

    // End Dynatrace RUM session explicitly
    await page.evaluate(() => { if (typeof dtrum !== 'undefined' && dtrum.endSession) dtrum.endSession(); }).catch(() => {});
    await rSleep(1, 2);

    console.log(`[${slotId}] END ${persona.username}: ${actions} actions ${totalDuration}s`);
  } catch (err) {
    console.error(`[${slotId}] Error:`, err.message);
  } finally {
    await context.close();
  }
}

// ---- Session loop per slot ----
async function sessionLoop(browser, slotId) {
  while (true) {
    await runSession(browser, slotId);
    const jitter = SESSION_INTERVAL * (0.5 + Math.random());
    console.log(`[${slotId}] Next session in ${Math.round(jitter / 1000)}s`);
    await sleep(jitter);
  }
}

// ---- Main ----
async function main() {
  console.log(`=== Browser Traffic Generator ===`);
  console.log(`URL: ${APP_URL}`);
  console.log(`Users: ${CONCURRENT_USERS} | MaxSession: ${MAX_SESSION_MS / 60000}min`);
  console.log(`Personas: ${PERSONAS.length} | Journeys: ${Object.keys(JOURNEYS).length}`);
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
