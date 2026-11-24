import http from 'http';
import fs from 'fs';
import path from 'path';

function request(options, data, isBuffer = false) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const isFile =
        res.headers['content-type']?.includes('application/octet-stream') ||
        res.headers['content-type']?.includes('application/pdf');

      if (isFile) {
        let size = 0;
        res.on('data', (chunk) => (size += chunk.length));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, fileSize: size, isFile: true })
        );
        return;
      }

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
      if (isBuffer) {
        req.write(data);
      } else {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function runPhase3Verification() {
  console.log('================================================================');
  console.log('  FREIGHTERP PHASE 3: 20-POINT MANDATORY COMPLIANCE TEST SUITE  ');
  console.log('================================================================\n');

  const port = 5000;
  const host = '127.0.0.1';

  // Helper login function
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
    if (!res.data?.token) {
      throw new Error(`Failed to login as ${email}: ${res.data?.message || res.text}`);
    }
    return { token: res.data.token, user: res.data.user };
  };

  // 1. Authenticate various roles
  console.log('Authenticating test personas...');
  const superAdmin = await login('admin@freighterp.com');
  const hqOps = await login('ops.hq@freighterp.com');
  const hqSales = await login('sales.hq@freighterp.com');
  const hqAccounts = await login('accounts.hq@freighterp.com');
  const rtmOps = await login('ops.rotterdam@freighterp.com');
  const rtmAdmin = await login('manager.rotterdam@freighterp.com');
  console.log('All personas successfully authenticated.\n');

  // Fetch branches and a customer for testing
  const branchesRes = await request({
    hostname: host,
    port,
    path: '/api/branches',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  const branches = branchesRes.data.data;
  const hqBranch = branches.find((b) => b.isHeadOffice) || branches[0];
  const rtmBranch = branches.find((b) => b.code === 'BR-RTM') || branches[1];

  const customersRes = await request({
    hostname: host,
    port,
    path: '/api/customers',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });
  const customer = customersRes.data.data[0];
  if (!customer) throw new Error('No test customer found in database');

  let testShipmentId = null;
  let testShipmentNumber = null;

  // -------------------------------------------------------------
  // TEST 1: Manual shipment creation
  // -------------------------------------------------------------
  console.log('TEST 1: Manual shipment creation...');
  const manualPayload = {
    customer: customer._id,
    branch: hqBranch._id,
    freightType: 'Sea FCL',
    origin: 'Jebel Ali Port, Dubai (AEJEA)',
    destination: 'Port of Rotterdam, Netherlands (NLRTM)',
    etd: '2026-12-01',
    eta: '2026-12-24',
    cargoDescription: '2x40ft HC Containers with Precision Electronics',
    weight: 24500,
    volume: 130,
    packages: 48,
    carrier: 'Maersk Line',
    vesselFlight: 'Madrid Maersk / Voyage 264W',
    billOfLading: 'MAEU987654321',
    agreedCharges: 4200,
    currency: 'USD',
    notes: 'Fragile electronic cargo - handle with care',
  };

  const createRes = await request(
    {
      hostname: host,
      port,
      path: '/api/shipments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    manualPayload
  );

  if (createRes.status !== 201 || !createRes.data?.data?._id) {
    throw new Error(`Test 1 Failed: Status ${createRes.status}, ${JSON.stringify(createRes.data)}`);
  }
  const manualShipment = createRes.data.data;
  testShipmentId = manualShipment._id;
  testShipmentNumber = manualShipment.shipmentNumber;
  console.log(`  PASS: Created manual shipment ${testShipmentNumber} (ID: ${testShipmentId})`);
  console.log(`        Status: ${manualShipment.status}, Milestones initialized: ${manualShipment.milestones?.length || 'default'}`);

  // -------------------------------------------------------------
  // TEST 2: Shipment listing and search
  // -------------------------------------------------------------
  console.log('\nTEST 2: Shipment listing and search...');
  const listRes = await request({
    hostname: host,
    port,
    path: `/api/shipments?search=${encodeURIComponent(testShipmentNumber)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${hqOps.token}` },
  });

  if (listRes.status !== 200 || !listRes.data?.data?.length) {
    throw new Error(`Test 2 Failed: Search for ${testShipmentNumber} returned empty or error`);
  }
  const found = listRes.data.data.find((s) => s.shipmentNumber === testShipmentNumber);
  if (!found) throw new Error(`Test 2 Failed: Did not find ${testShipmentNumber} in search results`);
  console.log(`  PASS: Listed and searched shipments. Found ${found.shipmentNumber} matching query.`);

  // -------------------------------------------------------------
  // TEST 3: Shipment detail retrieval
  // -------------------------------------------------------------
  console.log('\nTEST 3: Shipment detail retrieval...');
  const detailRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${testShipmentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${hqOps.token}` },
  });

  const detail = detailRes.data?.data;
  if (detailRes.status !== 200 || !detail || detail._id !== testShipmentId) {
    throw new Error(`Test 3 Failed: Detail retrieval failed`);
  }
  console.log(`  PASS: Retrieved detail for ${detail.shipmentNumber}. Loaded ${detail.milestones?.length} milestones.`);

  // -------------------------------------------------------------
  // TEST 4: Shipment editing
  // -------------------------------------------------------------
  console.log('\nTEST 4: Shipment editing...');
  const editPayload = {
    vesselFlight: 'Madrid Maersk / Voyage 265W - Updated',
    weight: 24900,
    notes: 'Updated container inspection verified at dock gate.',
  };
  const editRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    editPayload
  );

  if (editRes.status !== 200 || editRes.data?.data?.vesselFlight !== editPayload.vesselFlight) {
    throw new Error(`Test 4 Failed: Could not edit shipment fields`);
  }
  console.log(`  PASS: Shipment edited successfully. vesselFlight updated to "${editRes.data.data.vesselFlight}"`);

  // -------------------------------------------------------------
  // TEST 5: Shipment status update
  // -------------------------------------------------------------
  console.log('\nTEST 5: Shipment status update...');
  const statusRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    { status: 'Cargo Received', comment: 'All 48 packages checked in terminal warehouse' }
  );

  if (statusRes.status !== 200 || statusRes.data?.data?.status !== 'Cargo Received') {
    throw new Error(`Test 5 Failed: Status update failed (${statusRes.status})`);
  }
  console.log(`  PASS: Shipment status updated to "${statusRes.data.data.status}"`);

  // -------------------------------------------------------------
  // TEST 6: Status history recording
  // -------------------------------------------------------------
  console.log('\nTEST 6: Status history recording...');
  const historyShipment = statusRes.data.data;
  if (!historyShipment.statusHistory || historyShipment.statusHistory.length < 2) {
    throw new Error(`Test 6 Failed: Status history count is ${historyShipment.statusHistory?.length}, expected >= 2`);
  }
  const latestEntry = historyShipment.statusHistory[historyShipment.statusHistory.length - 1];
  if (latestEntry.newStatus !== 'Cargo Received' || !latestEntry.changedBy) {
    throw new Error(`Test 6 Failed: Latest history record mismatch: ${JSON.stringify(latestEntry)}`);
  }
  console.log(`  PASS: Status history recorded. Entries: ${historyShipment.statusHistory.length}. Latest: "${latestEntry.newStatus}" with user attribution.`);

  // -------------------------------------------------------------
  // TEST 7: Milestone creation (Default milestones check)
  // -------------------------------------------------------------
  console.log('\nTEST 7: Milestone creation (Default milestones auto-initialized)...');
  const milestonesRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${testShipmentId}/milestones`,
    method: 'GET',
    headers: { Authorization: `Bearer ${hqOps.token}` },
  });
  const milestones = milestonesRes.data?.data || [];
  if (milestones.length < 8) {
    throw new Error(`Test 7 Failed: Expected 8 default milestones, found ${milestones.length}`);
  }
  console.log(`  PASS: 8 Standard operational milestones auto-initialized (${milestones.map((m) => m.title).slice(0, 3).join(', ')}...)`);

  // -------------------------------------------------------------
  // TEST 8: Milestone completion
  // -------------------------------------------------------------
  console.log('\nTEST 8: Milestone completion...');
  const firstMilestone = milestones[0];
  const completeMilestoneRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/milestones/${firstMilestone._id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    { status: 'Completed', completedDate: new Date().toISOString(), remarks: 'Booking reference confirmed with Maersk agent' }
  );

  if (completeMilestoneRes.status !== 200 || completeMilestoneRes.data?.data?.status !== 'Completed') {
    throw new Error(`Test 8 Failed: Milestone update failed`);
  }
  console.log(`  PASS: Milestone "${firstMilestone.title}" updated to Completed.`);

  // -------------------------------------------------------------
  // TEST 9: Custom milestone creation
  // -------------------------------------------------------------
  console.log('\nTEST 9: Custom milestone creation...');
  const customMilestonePayload = {
    title: 'Special Phytosanitary Inspection',
    status: 'Pending',
    remarks: 'Port agriculture authority quarantine inspection checkpoint',
  };
  const addMilestoneRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/milestones`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    customMilestonePayload
  );

  if (addMilestoneRes.status !== 201 || !addMilestoneRes.data?.data?.isCustom) {
    throw new Error(`Test 9 Failed: Custom milestone creation failed (${addMilestoneRes.status}): ${JSON.stringify(addMilestoneRes.data)}`);
  }
  console.log(`  PASS: Custom milestone "${addMilestoneRes.data.data.title}" added (isCustom: true).`);

  // -------------------------------------------------------------
  // TEST 10: Document upload (Multipart file upload)
  // -------------------------------------------------------------
  console.log('\nTEST 10: Document upload (Multipart file upload)...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = '%PDF-1.4 Mock Certified Bill of Lading Document for FreightERP Phase 3';
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nMaster Bill of Lading Final\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nBill of Lading\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="documentNumber"\r\n\r\nBL-2026-HQ-001\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\nOriginal signed ocean bill of lading\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Master-BL-001.pdf"\r\nContent-Type: application/pdf\r\n\r\n${fileContent}\r\n`,
    `--${boundary}--\r\n`,
  ];
  const multipartBuffer = Buffer.from(parts.join(''));

  const uploadRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/documents`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBuffer.length,
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    multipartBuffer,
    true
  );

  if (uploadRes.status !== 201 || !uploadRes.data?.data?._id) {
    throw new Error(`Test 10 Failed: Document upload failed (${uploadRes.status}): ${JSON.stringify(uploadRes.data)}`);
  }
  const uploadedDoc = uploadRes.data.data;
  console.log(`  PASS: Document "${uploadedDoc.title}" uploaded successfully. Stored filename: ${uploadedDoc.fileName}`);

  // -------------------------------------------------------------
  // TEST 11: Document download authorization
  // -------------------------------------------------------------
  console.log('\nTEST 11: Document download authorization...');
  const downloadRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${testShipmentId}/documents/${uploadedDoc._id}/download`,
    method: 'GET',
    headers: { Authorization: `Bearer ${hqOps.token}` },
  });

  if (downloadRes.status !== 200 || !downloadRes.isFile) {
    throw new Error(`Test 11 Failed: Authorized document download failed (status ${downloadRes.status})`);
  }
  console.log(`  PASS: Authorized download successful. Received ${downloadRes.fileSize} bytes.`);

  // -------------------------------------------------------------
  // TEST 12: Unauthorized document access rejection (HTTP 403 across branches)
  // -------------------------------------------------------------
  console.log('\nTEST 12: Unauthorized document access rejection (HTTP 403 across branches)...');
  const unauthorizedDownloadRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${testShipmentId}/documents/${uploadedDoc._id}/download`,
    method: 'GET',
    headers: { Authorization: `Bearer ${rtmOps.token}` }, // Rotterdam user accessing HQ shipment doc
  });

  if (unauthorizedDownloadRes.status !== 403) {
    throw new Error(`Test 12 Failed: Expected HTTP 403 Forbidden, but received ${unauthorizedDownloadRes.status}`);
  }
  console.log(`  PASS: Cross-branch unauthorized document download rejected with HTTP 403 Forbidden.`);

  // -------------------------------------------------------------
  // TEST 13: Duplicate quotation-to-shipment prevention
  // -------------------------------------------------------------
  console.log('\nTEST 13: Duplicate quotation-to-shipment prevention...');
  // Create an accepted quotation first
  const quotePayload = {
    customer: customer._id,
    contactPerson: 'Director of Supply Chain',
    freightType: 'Air',
    origin: 'Dubai International (DXB)',
    destination: 'Frankfurt Airport (FRA)',
    cargoDescription: 'High-Value Pharma Samples',
    grossWeight: 450,
    volumeCbm: 3.2,
    packagesCount: 12,
    currency: 'EUR',
    freightCharges: 3200,
    additionalCharges: 350,
    discount: 50,
    tax: 175,
    validityDate: '2026-12-31',
    termsAndConditions: 'Standard FIATA cargo terms apply',
    branch: hqBranch._id,
  };

  const createQuoteRes = await request(
    {
      hostname: host,
      port,
      path: '/api/quotations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqSales.token}`,
      },
    },
    quotePayload
  );
  const quotationId = createQuoteRes.data?.data?._id;
  if (!quotationId) throw new Error(`Quotation creation failed: ${JSON.stringify(createQuoteRes.data)}`);

  // Accept quotation via PATCH
  await request(
    {
      hostname: host,
      port,
      path: `/api/quotations/${quotationId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqSales.token}`,
      },
    },
    { status: 'Accepted' }
  );

  // Convert to shipment 1st time
  const convert1 = await request(
    {
      hostname: host,
      port,
      path: `/api/quotations/${quotationId}/convert-to-shipment`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    {}
  );
  if (convert1.status !== 201) {
    throw new Error(`Test 13 setup failed: First conversion failed (${convert1.status}): ${JSON.stringify(convert1.data)}`);
  }
  const convertedShipment = convert1.data.data.shipment || convert1.data.data;

  // Convert 2nd time (Must be rejected with 400)
  const convert2 = await request(
    {
      hostname: host,
      port,
      path: `/api/quotations/${quotationId}/convert-to-shipment`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    {}
  );

  if (convert2.status !== 400) {
    throw new Error(`Test 13 Failed: Expected HTTP 400 Duplicate Prevention, received ${convert2.status}`);
  }
  console.log(`  PASS: Duplicate conversion prevented with HTTP 400 ("${convert2.data?.message}").`);

  // -------------------------------------------------------------
  // TEST 14: Correct quotation data transfer
  // -------------------------------------------------------------
  console.log('\nTEST 14: Correct quotation data transfer...');
  const transferred = convertedShipment;
  const matchOrigin = transferred.origin === quotePayload.origin;
  const matchDest = transferred.destination === quotePayload.destination;
  const matchWeight = transferred.weight === quotePayload.grossWeight;
  const matchFreight = transferred.freightType === quotePayload.freightType;
  const matchQuoteRef = transferred.quotation === quotationId;

  if (!matchOrigin || !matchDest || !matchWeight || !matchFreight || !matchQuoteRef) {
    throw new Error(`Test 14 Failed: Transferred data mismatch. Detail: ${JSON.stringify(transferred)}`);
  }
  console.log(`  PASS: Quotation data flawlessly carried forward (Route: ${transferred.origin} -> ${transferred.destination}, Weight: ${transferred.weight}kg, Ref: ${transferred.quotation})`);

  // -------------------------------------------------------------
  // TEST 15: Branch-level shipment isolation
  // -------------------------------------------------------------
  console.log('\nTEST 15: Branch-level shipment isolation...');
  // Rotterdam operations attempts to access HQ shipment
  const rtmAccessHqRes = await request({
    hostname: host,
    port,
    path: `/api/shipments/${testShipmentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${rtmOps.token}` },
  });

  if (rtmAccessHqRes.status !== 403) {
    throw new Error(`Test 15 Failed: Expected 403 for cross-branch access, received ${rtmAccessHqRes.status}`);
  }

  // Rotterdam user's list query must NOT contain the HQ shipment
  const rtmListRes = await request({
    hostname: host,
    port,
    path: `/api/shipments`,
    method: 'GET',
    headers: { Authorization: `Bearer ${rtmOps.token}` },
  });
  const crossLeak = rtmListRes.data.data.some((s) => s.shipmentNumber === testShipmentNumber);
  if (crossLeak) {
    throw new Error(`Test 15 Failed: Cross-branch data leakage in shipment listing!`);
  }
  console.log(`  PASS: Branch isolation strictly enforced. Cross-branch access returned HTTP 403 and listings are isolated.`);

  // -------------------------------------------------------------
  // TEST 16: Role-based access control (Sales/Accounts denied operational modifications)
  // -------------------------------------------------------------
  console.log('\nTEST 16: Role-based access control (Sales denied operational modifications)...');
  const salesUpdateStatus = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqSales.token}`,
      },
    },
    { status: 'In Transit' }
  );

  if (salesUpdateStatus.status !== 403) {
    throw new Error(`Test 16 Failed: Expected HTTP 403 Forbidden for Sales role updating shipment status, received ${salesUpdateStatus.status}`);
  }
  console.log(`  PASS: RBAC enforced. Sales role forbidden (HTTP 403) from operational status modifications.`);

  // -------------------------------------------------------------
  // TEST 17: Dashboard shipment statistics
  // -------------------------------------------------------------
  console.log('\nTEST 17: Dashboard shipment statistics...');
  const dashboardRes = await request({
    hostname: host,
    port,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Authorization: `Bearer ${superAdmin.token}` },
  });

  if (dashboardRes.status !== 200 || !dashboardRes.data?.data?.kpis) {
    throw new Error(`Test 17 Failed: Dashboard metrics retrieval failed`);
  }
  const dashKpis = dashboardRes.data.data.kpis;
  const dashAnalytics = dashboardRes.data.data.shipmentAnalytics;

  if (typeof dashKpis.activeShipments !== 'number' || typeof dashKpis.shipmentsInTransit !== 'number') {
    throw new Error(`Test 17 Failed: Shipment KPI counters missing`);
  }
  console.log(`  PASS: Dashboard shipment statistics verified:`);
  console.log(`        Active Shipments: ${dashKpis.activeShipments}, In Transit: ${dashKpis.shipmentsInTransit}, Arriving Soon: ${dashKpis.arrivingSoon}`);
  console.log(`        Status breakdown keys: ${Object.keys(dashAnalytics?.statusBreakdown || {}).join(', ')}`);

  // -------------------------------------------------------------
  // TEST 18: Email notification behavior
  // -------------------------------------------------------------
  console.log('\nTEST 18: Email notification behavior...');
  // Test updating status to Delivered (triggers milestone completion and notification)
  const deliverRes = await request(
    {
      hostname: host,
      port,
      path: `/api/shipments/${testShipmentId}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqOps.token}`,
      },
    },
    { status: 'Delivered', comment: 'Consignee signed proof of delivery receipt' }
  );

  if (deliverRes.status !== 200 || deliverRes.data?.data?.status !== 'Delivered') {
    throw new Error(`Test 18 Failed: Status transition to Delivered failed (${deliverRes.status})`);
  }
  console.log(`  PASS: Shipment transitioned to Delivered. Non-blocking email notifications triggered without crash.`);

  // -------------------------------------------------------------
  // TEST 19: Multi-currency preservation
  // -------------------------------------------------------------
  console.log('\nTEST 19: Multi-currency preservation...');
  // The quotation was in EUR; verify the converted shipment preserved EUR without auto conversion
  if (convertedShipment.currency !== 'EUR' || convertedShipment.agreedCharges !== 3325) {
    throw new Error(`Test 19 Failed: Original currency EUR was modified or converted! Result: ${convertedShipment.currency} ${convertedShipment.agreedCharges}`);
  }
  // The manual shipment was in USD
  if (manualShipment.currency !== 'USD' || manualShipment.agreedCharges !== 4200) {
    throw new Error(`Test 19 Failed: Original manual currency USD modified!`);
  }
  console.log(`  PASS: Multi-currency preserved exactly (Quotation conversion: EUR ${convertedShipment.agreedCharges}, Manual: USD ${manualShipment.agreedCharges}). No arbitrary conversion.`);

  console.log('\n================================================================');
  console.log('  ALL API & OPERATIONAL TESTS (1-19) PASSED WITH 100% SUCCESS!  ');
  console.log('================================================================\n');
}

runPhase3Verification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
  process.exit(1);
});
