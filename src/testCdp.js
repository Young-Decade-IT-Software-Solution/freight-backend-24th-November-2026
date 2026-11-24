import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.resolve(process.env.TEMP || 'C:\\Temp', 'chrome_cdp_audit');

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log('Spawning Chrome with CDP...');
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5173',
  ],
  { stdio: 'ignore' }
);

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9333/json/version');
    const data = await res.json();
    console.log('Connected to Chrome CDP successfully!');
    console.log('Browser:', data.Browser);
    console.log('WebSocket Debugger URL:', data.webSocketDebuggerUrl);

    // Fetch open pages
    const pagesRes = await fetch('http://127.0.0.1:9333/json/list');
    const pages = await pagesRes.json();
    console.log(`Found ${pages.length} open tab(s):`);
    pages.forEach((p, idx) => {
      console.log(` Tab ${idx + 1}: ${p.title} (${p.url}) - ws: ${p.webSocketDebuggerUrl}`);
    });

    chrome.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error connecting to Chrome:', err.message);
    chrome.kill();
    process.exit(1);
  }
}, 3000);
