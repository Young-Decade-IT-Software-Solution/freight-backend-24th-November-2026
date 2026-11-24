import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDir = path.resolve(process.env.TEMP || 'C:\\Temp', `chrome_audit_phase4_${Date.now()}`);
const screenshotsDir = path.resolve(process.cwd(), 'audit_screenshots');

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

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
  const filePath = path.join(screenshotsDir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`Captured: ${filename} (${buffer.length} bytes)`);
}

async function runAudit() {
  const port = 9333;
  console.log(`Starting headless Chrome on remote port ${port}...`);

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
  ]);

  await sleep(1500);

  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await listRes.json();
    const wsUrl = versionData.webSocketDebuggerUrl;

    const { ws, send } = await createCdpClient(wsUrl);
    await send('Target.setDiscoverTargets', { discover: true });

    const newTarget = await send('Target.createTarget', { url: 'http://localhost:5173/login' });
    const targetWsUrl = `ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`;
    const pageCdp = await createCdpClient(targetWsUrl);
    const pSend = pageCdp.send;

    await pSend('Page.enable');
    await pSend('DOM.enable');
    await pSend('Runtime.enable');

    console.log('Authenticating via API and injecting session...');
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@freighterp.com', password: 'Freight123!' }),
    }).then((r) => r.json());

    if (!loginRes.token) {
      throw new Error('API Login failed: ' + JSON.stringify(loginRes));
    }

    await pSend('Page.navigate', { url: 'http://localhost:5173/login' });
    await sleep(1000);

    await evalJs(
      pSend,
      `(() => {
        localStorage.setItem('freighterp_token', '${loginRes.token}');
        localStorage.setItem('freighterp_user', JSON.stringify(${JSON.stringify(loginRes.user)}));
      })()`
    );
    await sleep(500);

    // 1. Invoices List
    await pSend('Page.navigate', { url: 'http://localhost:5173/invoices' });
    await sleep(1500);
    await capture(pSend, '16_invoices_list.png');

    // 2. Customer Receipts
    await pSend('Page.navigate', { url: 'http://localhost:5173/receipts' });
    await sleep(1500);
    await capture(pSend, '17_customer_receipts.png');

    // 3. Suppliers Directory
    await pSend('Page.navigate', { url: 'http://localhost:5173/suppliers' });
    await sleep(1500);
    await capture(pSend, '18_suppliers_directory.png');

    // 4. Supplier Bills
    await pSend('Page.navigate', { url: 'http://localhost:5173/supplier-bills' });
    await sleep(1500);
    await capture(pSend, '19_supplier_bills.png');

    // 5. Expenses Management
    await pSend('Page.navigate', { url: 'http://localhost:5173/expenses' });
    await sleep(1500);
    await capture(pSend, '20_expenses_management.png');

    // 6. Cash & Bank Accounts
    await pSend('Page.navigate', { url: 'http://localhost:5173/cash-bank' });
    await sleep(1500);
    await capture(pSend, '21_cash_bank_accounts.png');

    // 7. Customer Ledger
    await pSend('Page.navigate', { url: 'http://localhost:5173/customer-ledger' });
    await sleep(1500);
    await capture(pSend, '22_customer_ledger.png');

    // 8. Accounts Receivable Aging
    await pSend('Page.navigate', { url: 'http://localhost:5173/accounts-receivable' });
    await sleep(1500);
    await capture(pSend, '23_accounts_receivable_aging.png');

    // 9. Profit & Loss Statement
    await pSend('Page.navigate', { url: 'http://localhost:5173/profit-loss' });
    await sleep(1500);
    await capture(pSend, '24_profit_and_loss_statement.png');

    // 10. Dashboard with Financial KPIs & Arabic RTL
    await pSend('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(1500);
    // Switch to Arabic
    await evalJs(
      pSend,
      `(() => {
        const langSelect = document.querySelector('select[aria-label="Language"]') || document.querySelectorAll('select')[0];
        if (langSelect) {
          langSelect.value = 'ar';
          langSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`
    );
    await sleep(1500);
    await capture(pSend, '25_arabic_rtl_financial_dashboard.png');

    console.log('All Phase 4 browser captures completed successfully!');
    ws.close();
    pageCdp.ws.close();
  } catch (err) {
    console.error('Browser audit error:', err);
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runAudit();
