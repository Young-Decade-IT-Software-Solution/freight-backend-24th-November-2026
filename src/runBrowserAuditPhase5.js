import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDir = path.resolve(process.env.TEMP || 'C:\\Temp', `chrome_audit_phase5_${Date.now()}`);
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

async function runBrowserAudit() {
  console.log('=== Starting Phase 5 Customer Portal Visual Browser Verification ===');
  const port = 9336;

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

    const newTarget = await bSend('Target.createTarget', { url: 'http://localhost:5173/portal/login' });
    const targetWsUrl = `ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`;
    const pageCdp = await createCdpClient(targetWsUrl);
    const send = pageCdp.send;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // 1. Customer Portal Login
    console.log('[1/11] Capturing 26_customer_portal_login.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/login' });
    await sleep(2500);
    await capture(send, '26_customer_portal_login.png');

    // Authenticate as Customer User A via API
    console.log('[AUTH] Fetching Customer User A token via backend API...');
    const loginRes = await fetch('http://localhost:5000/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@apexglobal.com', password: 'Freight123!' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const user = loginData.user;
    const customer = loginData.customer;

    if (!token) throw new Error('Failed to login as customer user: ' + JSON.stringify(loginData));

    // Inject portal token into localStorage
    await evalJs(
      send,
      `
      localStorage.setItem('freighterp_portal_token', ${JSON.stringify(token)});
      localStorage.setItem('freighterp_portal_user', ${JSON.stringify(JSON.stringify(user))});
      localStorage.setItem('freighterp_portal_customer', ${JSON.stringify(JSON.stringify(customer))});
      localStorage.setItem('i18nextLng', 'en');
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    `
    );

    // 2. Customer Portal Dashboard
    console.log('[2/11] Capturing 27_customer_portal_dashboard.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/dashboard' });
    await sleep(2500);
    await capture(send, '27_customer_portal_dashboard.png');

    // 3. Customer Portal Quotations
    console.log('[3/11] Capturing 28_customer_portal_quotations.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/quotations' });
    await sleep(2000);
    await capture(send, '28_customer_portal_quotations.png');

    // 4. Customer Portal Quotation Detail
    console.log('[4/11] Capturing 29_customer_portal_quotation_detail.png...');
    const quotesRes = await fetch('http://localhost:5000/api/portal/quotations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const quotesData = await quotesRes.json();
    const quoteId = quotesData.data?.[0]?._id;
    if (quoteId) {
      await send('Page.navigate', { url: `http://localhost:5173/portal/quotations/${quoteId}` });
      await sleep(2000);
      await capture(send, '29_customer_portal_quotation_detail.png');
    }

    // 5. Customer Portal Shipments
    console.log('[5/11] Capturing 30_customer_portal_shipments.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/shipments' });
    await sleep(2000);
    await capture(send, '30_customer_portal_shipments.png');

    // 6. Customer Portal Shipment Detail & Milestones
    console.log('[6/11] Capturing 31_customer_portal_shipment_detail.png...');
    const shipsRes = await fetch('http://localhost:5000/api/portal/shipments', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const shipsData = await shipsRes.json();
    const shipId = shipsData.data?.[0]?._id;
    if (shipId) {
      await send('Page.navigate', { url: `http://localhost:5173/portal/shipments/${shipId}` });
      await sleep(2000);
      await capture(send, '31_customer_portal_shipment_detail.png');
    }

    // 7. Customer Portal Documents Repository
    console.log('[7/11] Capturing 32_customer_portal_documents.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/documents' });
    await sleep(2000);
    await capture(send, '32_customer_portal_documents.png');

    // 8. Customer Portal Invoices
    console.log('[8/11] Capturing 33_customer_portal_invoices.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/invoices' });
    await sleep(2000);
    await capture(send, '33_customer_portal_invoices.png');

    // 9. Customer Portal Profile
    console.log('[9/11] Capturing 34_customer_portal_profile.png...');
    await send('Page.navigate', { url: 'http://localhost:5173/portal/profile' });
    await sleep(2000);
    await capture(send, '34_customer_portal_profile.png');

    // 10. Staff ERP Portal Accounts Management
    console.log('[10/11] Capturing 35_portal_accounts_admin.png...');
    const staffLoginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@freighterp.com', password: 'Freight123!' }),
    });
    const staffData = await staffLoginRes.json();
    await evalJs(
      send,
      `
      localStorage.setItem('freighterp_token', ${JSON.stringify(staffData.token)});
      localStorage.setItem('freighterp_user', ${JSON.stringify(JSON.stringify(staffData.user))});
      localStorage.setItem('i18nextLng', 'en');
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    `
    );
    await send('Page.navigate', { url: 'http://localhost:5173/portal-accounts' });
    await sleep(2500);
    await capture(send, '35_portal_accounts_admin.png');

    // 11. Arabic RTL Customer Portal
    console.log('[11/11] Capturing 36_customer_portal_arabic_rtl.png...');
    await evalJs(
      send,
      `
      localStorage.setItem('freighterp_portal_token', ${JSON.stringify(token)});
      localStorage.setItem('freighterp_portal_user', ${JSON.stringify(JSON.stringify(user))});
      localStorage.setItem('freighterp_portal_customer', ${JSON.stringify(JSON.stringify(customer))});
      localStorage.setItem('i18nextLng', 'ar');
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    `
    );
    await send('Page.navigate', { url: 'http://localhost:5173/portal/dashboard' });
    await sleep(2500);
    await capture(send, '36_customer_portal_arabic_rtl.png');

    pageCdp.ws.close();
    browserCdp.ws.close();
    console.log('\n=== All 11 Customer Portal Screenshots Captured Successfully! ===');
  } catch (err) {
    console.error('Visual browser audit error:', err);
  } finally {
    chromeProc.kill('SIGKILL');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runBrowserAudit();
