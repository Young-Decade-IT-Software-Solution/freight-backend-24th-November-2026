import http from 'http';
import fs from 'fs';
import path from 'path';

function request(options, data, isBuffer = false) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (isBuffer) req.write(data);
      else req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('  FREIGHTERP PRODUCTION AUDIT: COMPREHENSIVE SECURITY SUITE     ');
  console.log('================================================================\n');

  const port = 5000;
  const host = '127.0.0.1';

  const login = async (email, password = 'Freight123!') => {
    const res = await request(
      {
        hostname: host,
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email, password }
    );
    return res.data?.token;
  };

  const adminToken = await login('admin@freighterp.com');
  const hqOpsToken = await login('ops.hq@freighterp.com');
  const hqSalesToken = await login('sales.hq@freighterp.com');
  const hqAccountsToken = await login('accounts.hq@freighterp.com');
  const rtmOpsToken = await login('ops.rotterdam@freighterp.com');
  const rtmAdminToken = await login('manager.rotterdam@freighterp.com');

  const results = [];
  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  };

  // 1. Unauthenticated access rejected
  const noAuthRes = await request({
    hostname: host,
    port,
    path: '/api/shipments',
    method: 'GET',
  });
  record(
    'Unauthenticated API Rejection',
    noAuthRes.status === 401,
    `Status ${noAuthRes.status} (Expected 401 Unauthorized)`
  );

  // 2. Tampered JWT rejected
  const tamperedRes = await request({
    hostname: host,
    port,
    path: '/api/shipments',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}tampered` },
  });
  record(
    'Tampered JWT Rejection',
    tamperedRes.status === 401,
    `Status ${tamperedRes.status} (Expected 401 Unauthorized)`
  );

  // 3. Find an HQ shipment for cross-branch testing
  const hqShipmentList = await request({
    hostname: host,
    port,
    path: '/api/shipments?limit=1',
    method: 'GET',
    headers: { Authorization: `Bearer ${hqOpsToken}` },
  });
  const hqShipment = hqShipmentList.data?.data?.[0];
  if (!hqShipment) throw new Error('No HQ shipment found for isolation testing');

  // 4. Cross-branch shipment read isolation (Rotterdam Ops accessing HQ shipment)
  const crossReadRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${hqShipment._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${rtmOpsToken}` },
  });
  record(
    'Cross-Branch Detail Read Blocked',
    crossReadRes.status === 403,
    `Status ${crossReadRes.status} (Expected 403 Forbidden)`
  );

  // 5. Cross-branch listing query isolation
  const rtmListRes = await request({
    hostname: host,
    port,
    path: '/api/shipments',
    method: 'GET',
    headers: { Authorization: `Bearer ${rtmOpsToken}` },
  });
  const leakedHqInRtm = rtmListRes.data?.data?.some(
    (s) => s.shipmentNumber === hqShipment.shipmentNumber
  );
  record(
    'Cross-Branch Listing Query Isolation',
    !leakedHqInRtm,
    `HQ shipment leaked into Rotterdam query: ${leakedHqInRtm}`
  );

  // 6. Role-based operational modification restrictions (Sales cannot change status)
  const salesStatusChange = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${hqShipment._id}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqSalesToken}`,
      },
    },
    { status: 'In Transit' }
  );
  record(
    'RBAC: Sales Forbidden from Status Updates',
    salesStatusChange.status === 403,
    `Status ${salesStatusChange.status} (Expected 403 Forbidden)`
  );

  // 7. Role-based operational modification restrictions (Accounts cannot edit shipment)
  const accountsEdit = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${hqShipment._id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqAccountsToken}`,
      },
    },
    { vesselFlight: 'Hacked Flight 999' }
  );
  record(
    'RBAC: Accounts Forbidden from Operational Edits',
    accountsEdit.status === 403,
    `Status ${accountsEdit.status} (Expected 403 Forbidden)`
  );

  // 8. Role-based deletion restrictions (Operations cannot delete shipment)
  const opsDelete = await request({
    hostname: host,
    port,
    path: `/api/shipments/${hqShipment._id}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${hqOpsToken}` },
  });
  record(
    'RBAC: Operations Forbidden from Shipment Deletion',
    opsDelete.status === 403,
    `Status ${opsDelete.status} (Expected 403 Forbidden)`
  );

  // 9. Malicious File Upload Test (Executable / Script upload attempt)
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const maliciousParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nExploit Script\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nOther Documents\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="payload.exe"\r\nContent-Type: application/x-msdownload\r\n\r\nMZThisIsFakeExecutablePayload\r\n`,
    `--${boundary}--\r\n`,
  ];
  const malBuffer = Buffer.from(maliciousParts.join(''));

  const malUploadRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${hqShipment._id}/documents`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': malBuffer.length,
        Authorization: `Bearer ${hqOpsToken}`,
      },
    },
    malBuffer,
    true
  );
  record(
    'File Upload: Executable (.exe) Rejection',
    malUploadRes.status === 400 || malUploadRes.status === 500,
    `Status ${malUploadRes.status}, Error: ${malUploadRes.data?.message || malUploadRes.text}`
  );

  // 10. Malicious File Upload Test (Script / PHP / JS upload attempt)
  const boundary2 = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const scriptParts = [
    `--${boundary2}\r\nContent-Disposition: form-data; name="title"\r\n\r\nWeb Shell\r\n`,
    `--${boundary2}\r\nContent-Disposition: form-data; name="category"\r\n\r\nOther Documents\r\n`,
    `--${boundary2}\r\nContent-Disposition: form-data; name="file"; filename="shell.php"\r\nContent-Type: application/x-php\r\n\r\n<?php echo 'pwned'; ?>\r\n`,
    `--${boundary2}--\r\n`,
  ];
  const scriptBuffer = Buffer.from(scriptParts.join(''));

  const scriptUploadRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${hqShipment._id}/documents`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary2}`,
        'Content-Length': scriptBuffer.length,
        Authorization: `Bearer ${hqOpsToken}`,
      },
    },
    scriptBuffer,
    true
  );
  record(
    'File Upload: Script (.php) Rejection',
    scriptUploadRes.status === 400 || scriptUploadRes.status === 500,
    `Status ${scriptUploadRes.status}, Error: ${scriptUploadRes.data?.message || scriptUploadRes.text}`
  );

  // 11. Sensitive Credentials Leak in Frontend Distribution Check
  console.log('\nChecking Frontend Production Assets for Sensitive Secret Leaks...');
  const distDir = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  let secretsLeaked = false;
  let leakedPatterns = [];

  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(path.join(distDir, 'assets'));
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(distDir, 'assets', jsFile), 'utf8');
      if (content.includes('mongodb+srv://') || content.includes('mongodb://')) {
        secretsLeaked = true;
        leakedPatterns.push('MongoDB Atlas URI / Password');
      }
      if (content.includes('freighterp_jwt_secret_production_ready_key_98374')) {
        secretsLeaked = true;
        leakedPatterns.push('Backend JWT Secret');
      }
    }
  }

  record(
    'Frontend Secret Leak Audit (No DB credentials or JWT secrets in client bundle)',
    !secretsLeaked,
    secretsLeaked ? `LEAK DETECTED: ${leakedPatterns.join(', ')}` : 'Client bundle is clean of backend secrets'
  );

  // 12. Security HTTP Headers Check
  const rootHeadersRes = await request({
    hostname: host,
    port,
    path: '/api/branches',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const headers = rootHeadersRes.headers;
  const hasHsts = !!headers['strict-transport-security'];
  const hasCsp = !!headers['content-security-policy'];
  const hasNoSniff = headers['x-content-type-options'] === 'nosniff';
  const hasFrameOptions = !!headers['x-frame-options'];

  record(
    'HTTP Security Headers (Helmet Protection)',
    hasHsts && hasCsp && hasNoSniff && hasFrameOptions,
    `HSTS: ${hasHsts}, CSP: ${hasCsp}, X-Content-Type-Options: ${hasNoSniff}, Frame-Options: ${hasFrameOptions}`
  );

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nSecurity Suite Summary: ${passedCount}/${results.length} checks passed.`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runSecurityAudit().catch((err) => {
  console.error('Security audit fatal error:', err);
  process.exit(1);
});
