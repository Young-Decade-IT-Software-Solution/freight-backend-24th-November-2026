import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDir = path.resolve(process.env.TEMP || 'C:\\Temp', `chrome_audit_${Date.now()}`);
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'Evaluation error');
  }
  return result.result?.value;
}

async function takeScreenshot(send, filename) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const filePath = path.join(screenshotsDir, filename);
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  console.log(`    [Screenshot Saved] -> ${filename}`);
  return filePath;
}

async function runBrowserAudit() {
  console.log('================================================================');
  console.log('  FREIGHTERP PRODUCTION AUDIT: REAL GOOGLE CHROME BROWSER TEST  ');
  console.log('================================================================\n');

  const port = 9555;
  console.log(`1. Launching Google Chrome (Headless New, Isolated Profile, Port ${port})...`);
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tempDir}`,
      '--disable-gpu',
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'http://localhost:5173/login',
    ],
    { stdio: 'ignore' }
  );

  await sleep(3000);

  try {
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await tabsRes.json();
    const appTab = tabs.find((t) => t.url.includes('localhost:5173')) || tabs[0];
    if (!appTab) throw new Error('Could not find FreightERP tab in Chrome');

    console.log(`2. Connecting to Chrome Tab WebSocket: ${appTab.title} (${appTab.url})...`);
    const { ws, send } = await createCdpClient(appTab.webSocketDebuggerUrl);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log('\n--- TEST SUITE 1: LOGIN PAGE & DEMO ACCOUNTS ---');
    await sleep(2000);
    const pageTitle = await evalJs(send, 'document.title');
    console.log(`  Page Title: "${pageTitle}"`);

    const demoButtonsCount = await evalJs(
      send,
      'document.querySelectorAll(".demo-account-btn").length'
    );
    console.log(`  Demo Account Quick Buttons Found: ${demoButtonsCount}`);
    await takeScreenshot(send, '01_login_page.png');

    // --- TEST 1.1: Super Admin Login & Global Dashboard ---
    console.log('\n--- TEST 1.1: SUPER ADMIN LOGIN & GLOBAL DASHBOARD ---');
    await evalJs(
      send,
      `
      (() => {
        const btn = document.querySelectorAll('.demo-account-btn')[0];
        if (btn) btn.click();
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      })()
    `
    );
    await sleep(2500);

    const currentUrl = await evalJs(send, 'window.location.pathname');
    const userRoleText = await evalJs(
      send,
      'document.querySelector(".user-badge-mini")?.innerText || ""'
    );
    console.log(`  Current Route: ${currentUrl}`);
    console.log(`  Active User Persona: ${userRoleText.replace(/\\n/g, ' ')}`);

    const statCardsCount = await evalJs(send, 'document.querySelectorAll(".stat-card").length');
    console.log(`  Rendered KPI Stat Cards: ${statCardsCount}`);

    const hasInTransitCard = await evalJs(
      send,
      'document.body.innerText.includes("In Transit")'
    );
    console.log(`  Phase 3 "In Transit" Operational Card Present: ${hasInTransitCard}`);
    await takeScreenshot(send, '02_superadmin_dashboard.png');

    // --- TEST 1.2: Branch Management (Global) ---
    console.log('\n--- TEST 1.2: BRANCH MANAGEMENT VIEW ---');
    await evalJs(send, 'window.location.href = "/branches"');
    await sleep(2000);
    const branchRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Branches in Table: ${branchRows} hubs (Expected: 5)`);
    await takeScreenshot(send, '03_branches_page.png');

    // --- TEST 1.3: User Management (15 Users) ---
    console.log('\n--- TEST 1.3: USER MANAGEMENT VIEW ---');
    await evalJs(send, 'window.location.href = "/users"');
    await sleep(2000);
    const userRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Users in Table: ${userRows} staff accounts (Expected >= 15)`);
    await takeScreenshot(send, '04_users_page.png');

    // --- TEST 1.4: Leads & Customers ---
    console.log('\n--- TEST 1.4: LEADS & CUSTOMERS ---');
    await evalJs(send, 'window.location.href = "/leads"');
    await sleep(2000);
    const leadRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Leads: ${leadRows}`);

    await evalJs(send, 'window.location.href = "/customers"');
    await sleep(2000);
    const customerRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Customers: ${customerRows}`);
    await takeScreenshot(send, '05_customers_page.png');

    // --- TEST 1.5: Quotations & Quotation Detail ---
    console.log('\n--- TEST 1.5: QUOTATIONS & DETAIL VIEW ---');
    await evalJs(send, 'window.location.href = "/quotations"');
    await sleep(2000);
    const quoteRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Quotations: ${quoteRows}`);
    await takeScreenshot(send, '06_quotations_list.png');

    // --- TEST 1.6: Shipments Listing & Manual Creation Modal ---
    console.log('\n--- TEST 1.6: SHIPMENTS LISTING & MODALS ---');
    await evalJs(send, 'window.location.href = "/shipments"');
    await sleep(2000);
    const shipmentRows = await evalJs(send, 'document.querySelectorAll("table.erp-table tbody tr").length');
    console.log(`  Rendered Shipments in Listing: ${shipmentRows}`);
    await takeScreenshot(send, '08_shipments_list.png');

    // --- TEST 1.7: Shipment Detail View (Milestones, Documents, Timeline) ---
    console.log('\n--- TEST 1.7: SHIPMENT DETAIL, TIMELINE & DOCUMENTS ---');
    const firstShipmentLink = await evalJs(
      send,
      'document.querySelector("table.erp-table tbody tr td a")?.getAttribute("href") || ""'
    );
    if (firstShipmentLink) {
      await evalJs(send, `window.location.href = "${firstShipmentLink}"`);
      await sleep(2000);
      const shipmentTitle = await evalJs(send, 'document.querySelector(".page-title")?.innerText || ""');
      console.log(`  Shipment Detail Page: "${shipmentTitle}"`);

      // Switch to Milestones tab
      await evalJs(
        send,
        `
        (() => {
          const tabs = Array.from(document.querySelectorAll('.tab-btn, button'));
          const msTab = tabs.find(t => t.innerText.includes('Milestones') || t.innerText.includes('المراحل'));
          if (msTab) msTab.click();
        })()
      `
      );
      await sleep(1000);
      await takeScreenshot(send, '10_shipment_milestones_tab.png');

      // Switch to Documents tab
      await evalJs(
        send,
        `
        (() => {
          const tabs = Array.from(document.querySelectorAll('.tab-btn, button'));
          const docTab = tabs.find(t => t.innerText.includes('Documents') || t.innerText.includes('مستندات'));
          if (docTab) docTab.click();
        })()
      `
      );
      await sleep(1000);
      await takeScreenshot(send, '11_shipment_documents_tab.png');
    }

    // --- TEST SUITE 2: MULTI-LANGUAGE SWITCHING & RTL AUDIT ---
    console.log('\n--- TEST SUITE 2: MULTI-LANGUAGE UI & ARABIC RTL AUDIT ---');

    // 2.1 Arabic (RTL)
    console.log('Testing Arabic (العربية) with RTL Layout...');
    await evalJs(
      send,
      `
      (() => {
        const globeBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Change Language' || b.innerText.includes('EN'));
        if (globeBtn) globeBtn.click();
      })()
    `
    );
    await sleep(500);

    await evalJs(
      send,
      `
      (() => {
        const arBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('العربية'));
        if (arBtn) arBtn.click();
      })()
    `
    );
    await sleep(1500);

    const htmlDir = await evalJs(send, 'document.documentElement.getAttribute("dir")');
    const htmlLang = await evalJs(send, 'document.documentElement.getAttribute("lang")');
    console.log(`  Document HTML dir attribute: "${htmlDir}" (Expected: rtl)`);
    console.log(`  Document HTML lang attribute: "${htmlLang}" (Expected: ar)`);
    await takeScreenshot(send, '12_arabic_rtl_layout.png');

    // 2.2 Turkish (Türkçe)
    console.log('Testing Turkish (Türkçe)...');
    await evalJs(
      send,
      `
      (() => {
        const globeBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Change Language');
        if (globeBtn) globeBtn.click();
      })()
    `
    );
    await sleep(500);
    await evalJs(
      send,
      `
      (() => {
        const trBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Türkçe'));
        if (trBtn) trBtn.click();
      })()
    `
    );
    await sleep(1500);
    console.log(`  Turkish language activated.`);
    await takeScreenshot(send, '13_turkish_layout.png');

    // 2.3 Simplified Chinese (简体中文)
    console.log('Testing Simplified Chinese (简体中文)...');
    await evalJs(
      send,
      `
      (() => {
        const globeBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Change Language');
        if (globeBtn) globeBtn.click();
      })()
    `
    );
    await sleep(500);
    await evalJs(
      send,
      `
      (() => {
        const zhBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('简体中文'));
        if (zhBtn) zhBtn.click();
      })()
    `
    );
    await sleep(1500);
    console.log(`  Chinese language activated.`);
    await takeScreenshot(send, '14_chinese_layout.png');

    // Revert to English
    await evalJs(
      send,
      `
      (() => {
        const globeBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Change Language');
        if (globeBtn) globeBtn.click();
      })()
    `
    );
    await sleep(500);
    await evalJs(
      send,
      `
      (() => {
        const enBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('English'));
        if (enBtn) enBtn.click();
      })()
    `
    );
    await sleep(1000);

    // --- TEST SUITE 3: ROLE-BASED LOGIN & PERMISSION ISOLATION IN UI ---
    console.log('\n--- TEST SUITE 3: 5 ROLES LOGIN & RBAC UI NAVIGATION TEST ---');
    const roles = [
      { name: 'Branch Admin', index: 1, email: 'manager.rotterdam@freighterp.com' },
      { name: 'Sales', index: 2, email: 'sales.hq@freighterp.com', forbiddenPages: ['Branch Management', 'User Management'] },
      { name: 'Operations', index: 3, email: 'ops.hq@freighterp.com', forbiddenPages: ['Branch Management', 'User Management', 'Leads (CRM)', 'Quotations'] },
      { name: 'Accounts', index: 4, email: 'accounts.hq@freighterp.com', forbiddenPages: ['Branch Management', 'User Management', 'Leads (CRM)', 'Quotations'] },
    ];

    for (const role of roles) {
      console.log(`Testing Role: ${role.name}...`);
      // Properly sign out and wait for /login
      await evalJs(
        send,
        `
        (() => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = '/login';
        })()
      `
      );
      await sleep(2500);

      // Verify we are on /login
      await evalJs(
        send,
        `
        (() => {
          const emailInput = document.querySelector('input[type="email"]');
          const passInput = document.querySelector('input[type="password"]');
          if (emailInput) {
            // Native input setter to trigger React synthetic onChange
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(emailInput, '${role.email}');
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            nativeInputValueSetter.call(passInput, 'Freight123!');
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
              const submitBtn = document.querySelector('button[type="submit"]');
              if (submitBtn) submitBtn.click();
            }, 300);
          }
        })()
      `
      );
      await sleep(3000);

      const activeUser = await evalJs(
        send,
        'document.querySelector(".user-badge-mini")?.innerText || ""'
      );
      console.log(`  Logged in persona: ${activeUser.replace(/\\n/g, ' ')}`);

      const navItems = await evalJs(
        send,
        'Array.from(document.querySelectorAll(".nav-item span")).map(s => s.innerText.trim()).filter(Boolean)'
      );
      console.log(`  ${role.name} Visible Nav Items: [${navItems.join(', ')}]`);

      if (role.forbiddenPages) {
        for (const forbidden of role.forbiddenPages) {
          const hasForbiddenInNav = navItems.includes(forbidden);
          if (hasForbiddenInNav) {
            console.warn(`  [RBAC WARN] ${role.name} sees forbidden link "${forbidden}"`);
          } else {
            console.log(`  [RBAC PASS] Forbidden item "${forbidden}" properly hidden`);
          }
        }
      }
      await takeScreenshot(send, `15_role_${role.name.replace(/\\s+/g, '_').toLowerCase()}.png`);
    }

    console.log('\n================================================================');
    console.log('  ALL BROWSER FUNCTIONAL & VISUAL AUDIT TESTS COMPLETED!         ');
    console.log('================================================================\n');

    ws.close();
    chrome.kill();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ BROWSER AUDIT ERROR:', err);
    chrome.kill();
    process.exit(1);
  }
}

runBrowserAudit();
