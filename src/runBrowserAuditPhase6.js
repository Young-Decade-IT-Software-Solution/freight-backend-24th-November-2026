import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDir = path.resolve(process.env.TEMP || 'C:\\Temp', `chrome_audit_phase6_${Date.now()}`);
const artifactsScreenshotsDir = 'C:\\Users\\YD\\.gemini\\antigravity\\brain\\f7be934f-6b94-458e-be63-c91e47f3e5fe\\screenshots';

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(artifactsScreenshotsDir)) fs.mkdirSync(artifactsScreenshotsDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const reqId = id++;
          callbacks.set(reqId, { res, rej });
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });
      resolve({ ws, send });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
          const { res, rej } = callbacks.get(msg.id);
          callbacks.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        }
      } catch (e) {
        console.error('CDP message parse error:', e);
      }
    };

    ws.onerror = reject;
  });
}

async function evalJs(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.result?.value;
}

async function capture(send, filename) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(screenshot.data, 'base64');
  const targetPath = path.join(artifactsScreenshotsDir, filename);
  fs.writeFileSync(targetPath, buffer);
  console.log(`[SCREENSHOT] Saved: ${filename} (${buffer.length} bytes)`);
}

async function runPhase6BrowserAudit() {
  console.log('=== Starting Phase 6 Reports & Settings Visual Browser Verification ===');
  const port = 9338;

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
  ]);

  await sleep(1500);

  try {
    const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await versionRes.json();
    const wsUrl = versionData.webSocketDebuggerUrl;

    const browserCdp = await createCdpClient(wsUrl);
    const bSend = browserCdp.send;
    await bSend('Target.setDiscoverTargets', { discover: true });

    const newTarget = await bSend('Target.createTarget', { url: 'http://localhost:5173/login' });
    const targetWsUrl = `ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`;
    const pageCdp = await createCdpClient(targetWsUrl);
    const send = pageCdp.send;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // 1. Authenticate as Super Admin via API
    console.log('[AUTH] Logging in as Super Admin via API...');
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@freighterp.com', password: 'Freight123!' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const user = loginData.user;

    if (!token) throw new Error('Failed to login as admin: ' + JSON.stringify(loginData));

    // Inject auth into browser localStorage
    await send('Page.navigate', { url: 'http://localhost:5173/login' });
    await sleep(1000);

    await evalJs(
      send,
      `
      localStorage.setItem('freighterp_token', ${JSON.stringify(token)});
      localStorage.setItem('freighterp_user', ${JSON.stringify(JSON.stringify(user))});
      localStorage.setItem('i18nextLng', 'en');
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    `
    );

    // 2. Reports & Analytics Dashboard
    console.log('[1/5] Capturing 37_reports_analytics_dashboard.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/reports' });
    await sleep(2500);
    await capture(send, '37_reports_analytics_dashboard.png');

    // 3. System Settings - Company Tab
    console.log('[2/5] Capturing 38_system_settings_company.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/settings' });
    await sleep(2500);
    await capture(send, '38_system_settings_company.png');

    // 4. System Settings - Branches Tab
    console.log('[3/5] Capturing 39_system_settings_branches.png...');
    await evalJs(
      send,
      `
      const buttons = Array.from(document.querySelectorAll('button'));
      const branchBtn = buttons.find(b => b.textContent && b.textContent.includes('Branches'));
      if (branchBtn) branchBtn.click();
    `
    );
    await sleep(1500);
    await capture(send, '39_system_settings_branches.png');

    // 5. System Settings - SMTP Email Tab
    console.log('[4/5] Capturing 40_system_settings_email_smtp.png...');
    await evalJs(
      send,
      `
      const buttons = Array.from(document.querySelectorAll('button'));
      const emailBtn = buttons.find(b => b.textContent && b.textContent.includes('SMTP Email'));
      if (emailBtn) emailBtn.click();
    `
    );
    await sleep(1500);
    await capture(send, '40_system_settings_email_smtp.png');

    // 6. Arabic RTL Reports Dashboard
    console.log('[5/5] Capturing 41_arabic_rtl_reports_dashboard.png...');
    await evalJs(
      send,
      `
      localStorage.setItem('i18nextLng', 'ar');
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    `
    );
    await send('Page.navigate', { url: 'http://localhost:5173/reports' });
    await sleep(2500);
    await evalJs(
      send,
      `
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    `
    );
    await capture(send, '41_arabic_rtl_reports_dashboard.png');

    console.log('=== All 5 Visual Phase 6 Screenshots Captured Successfully ===');
  } catch (err) {
    console.error('Visual capture error:', err);
  } finally {
    try {
      chromeProc.kill('SIGKILL');
    } catch (e) {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runPhase6BrowserAudit().then(() => process.exit(0));
