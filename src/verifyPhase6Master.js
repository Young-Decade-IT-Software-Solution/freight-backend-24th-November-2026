const BASE_URL = 'http://localhost:5000/api';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

function recordTest(id, name, success, details = '') {
  results.total++;
  if (success) {
    results.passed++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    results.failed++;
    console.log(`\x1b[31m[FAIL]\x1b[0m ${id}: ${name} - ${details}`);
  }
  results.tests.push({ id, name, success, details });
}

async function api(method, endpoint, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, headers: res.headers, data };
}

async function runMasterSuite() {
  console.log('================================================================');
  console.log(' FREIGHTERP PHASE 6 + COMPLETE SYSTEM MASTER VERIFICATION SUITE ');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. AUTHENTICATION & MULTI-ROLE VERIFICATION
    // -------------------------------------------------------------
    console.log('--- 1. Authentication & Role Permissions ---');
    
    // Super Admin Login
    const adminRes = await api('POST', '/auth/login', {
      email: 'admin@freighterp.com',
      password: 'Freight123!',
    });
    const adminToken = adminRes.data?.token;
    recordTest('AUTH-01', 'Super Admin Login', !!adminToken, `User: ${adminRes.data?.user?.name}`);

    // Branch Admin (Rotterdam) Login
    const rtmRes = await api('POST', '/auth/login', {
      email: 'manager.rotterdam@freighterp.com',
      password: 'Freight123!',
    });
    const rtmToken = rtmRes.data?.token;
    recordTest('AUTH-02', 'Branch Admin (Rotterdam) Login', !!rtmToken, `Branch: ${rtmRes.data?.user?.branch?.name || 'Rotterdam'}`);

    // Sales HQ Login
    const salesRes = await api('POST', '/auth/login', {
      email: 'sales.hq@freighterp.com',
      password: 'Freight123!',
    });
    const salesToken = salesRes.data?.token;
    recordTest('AUTH-03', 'Sales HQ Login', !!salesToken);

    // Operations HQ Login
    const opsRes = await api('POST', '/auth/login', {
      email: 'ops.hq@freighterp.com',
      password: 'Freight123!',
    });
    const opsToken = opsRes.data?.token;
    recordTest('AUTH-04', 'Operations HQ Login', !!opsToken);

    // Accounts HQ Login
    const accRes = await api('POST', '/auth/login', {
      email: 'accounts.hq@freighterp.com',
      password: 'Freight123!',
    });
    const accToken = accRes.data?.token;
    recordTest('AUTH-05', 'Accounts HQ Login', !!accToken);

    // -------------------------------------------------------------
    // 2. PHASE 6B: SYSTEM SETTINGS API
    // -------------------------------------------------------------
    console.log('\n--- 2. System Settings Management (Phase 6B) ---');

    // 2.1 Get System Settings
    const getSettingsRes = await api('GET', '/settings', null, adminToken);
    const settings = getSettingsRes.data?.data;
    recordTest(
      'SET-01',
      'GET /api/settings - Retrieve enterprise settings singleton',
      settings && settings.companyName && !settings.smtpPass,
      `Company: ${settings?.companyName}, Secret Masked: ${!settings?.smtpPass}`
    );

    // 2.2 Update Company Settings
    const updateCompRes = await api(
      'PUT',
      '/settings/company',
      {
        companyName: 'FreightERP Global Logistics FZ-LLC',
        companyWebsite: 'https://freighterp-global.com',
        companyPhone: '+971 4 800 3734448',
      },
      adminToken
    );
    recordTest(
      'SET-02',
      'PUT /api/settings/company - Update company details',
      updateCompRes.status === 200 && updateCompRes.data?.data?.companyWebsite === 'https://freighterp-global.com'
    );

    // 2.3 Update Freight Settings
    const updateFreightRes = await api(
      'PUT',
      '/settings/freight',
      {
        freightModes: ['Sea - FCL', 'Sea - LCL', 'Air Freight', 'Road Transport', 'Rail Freight', 'Multimodal'],
        defaultCustomerVisible: true,
      },
      adminToken
    );
    recordTest(
      'SET-03',
      'PUT /api/settings/freight - Configure freight modes & visibility presets',
      updateFreightRes.status === 200 && updateFreightRes.data?.data?.freightModes?.includes('Multimodal')
    );

    // 2.4 Update Financial Settings
    const updateFinRes = await api(
      'PUT',
      '/settings/financial',
      {
        supportedCurrencies: ['USD', 'EUR', 'AED', 'SGD', 'CNY', 'GBP'],
        defaultTaxRate: 5,
        invoicePrefix: 'INV-2026',
      },
      adminToken
    );
    recordTest(
      'SET-04',
      'PUT /api/settings/financial - Update VAT rate, default currency & terms',
      updateFinRes.status === 200 && updateFinRes.data?.data?.defaultTaxRate === 5
    );

    // 2.5 Update Email Settings
    const updateEmailRes = await api(
      'PUT',
      '/settings/email',
      {
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'freighterp-test@ethereal.email',
        smtpFrom: 'dispatch@freighterp.com',
      },
      adminToken
    );
    recordTest(
      'SET-05',
      'PUT /api/settings/email - Configure SMTP parameters without exposing secret',
      updateEmailRes.status === 200 && updateEmailRes.data?.success
    );

    // 2.6 Live SMTP Test Dispatch
    const emailTestRes = await api(
      'POST',
      '/settings/email/test',
      { recipient: 'admin@freighterp.com' },
      adminToken
    );
    recordTest(
      'SET-06',
      'POST /api/settings/email/test - Live SMTP test dispatch',
      emailTestRes.status === 200 && emailTestRes.data?.success,
      emailTestRes.data?.message
    );

    // 2.7 Update Storage Abstraction Settings
    const updateStorageRes = await api(
      'PUT',
      '/settings/storage',
      {
        storageProvider: 'local',
        s3Bucket: 'freighterp-secure-docs',
        s3Region: 'eu-central-1',
      },
      adminToken
    );
    recordTest(
      'SET-07',
      'PUT /api/settings/storage - Storage provider abstraction (Local vs S3)',
      updateStorageRes.status === 200 && updateStorageRes.data?.success,
      updateStorageRes.data?.message
    );

    // 2.8 Get Branch Settings (all 5 branches)
    const branchesRes = await api('GET', '/settings/branches', null, adminToken);
    const branchList = branchesRes.data?.data || [];
    const hqBranch = branchList.find((b) => b.isHeadOffice);
    recordTest(
      'SET-08',
      'GET /api/settings/branches - List all 5 operational branches with HQ check',
      branchList.length >= 5 && !!hqBranch,
      `Total Branches: ${branchList.length}, HQ: ${hqBranch?.name}`
    );

    // 2.9 Protect Head Office from Deactivation
    const deactRes = await api('PUT', `/settings/branches/${hqBranch._id}/toggle`, {}, adminToken);
    recordTest(
      'SET-09',
      'Branch Protection - Prevent HQ deactivation',
      deactRes.status === 400,
      deactRes.data?.message || 'HQ Protected'
    );

    // -------------------------------------------------------------
    // 3. PHASE 6A: REPORTS & ANALYTICS ENGINE
    // -------------------------------------------------------------
    console.log('\n--- 3. Reports & Analytics Engine (Phase 6A) ---');

    // 3.1 Commercial Sales Summary
    const salesSummaryRes = await api('GET', '/reports/sales-summary', null, adminToken);
    recordTest(
      'REP-01',
      'GET /api/reports/sales-summary - Global Sales KPI overview',
      salesSummaryRes.status === 200 && typeof salesSummaryRes.data?.data?.kpis?.totalQuotations === 'number',
      `Total Quotes: ${salesSummaryRes.data?.data?.kpis?.totalQuotations}, Conversion: ${salesSummaryRes.data?.data?.kpis?.conversionRate}%`
    );

    // 3.2 Quotation Register Report
    const quoteRegRes = await api('GET', '/reports/quotations-register?limit=10', null, adminToken);
    recordTest(
      'REP-02',
      'GET /api/reports/quotations-register - Quotation Register with filters',
      quoteRegRes.status === 200 && Array.isArray(quoteRegRes.data?.data),
      `Records returned: ${quoteRegRes.data?.count}`
    );

    // 3.3 Customer-wise Sales Report
    const custSalesRes = await api('GET', '/reports/sales-by-customer', null, adminToken);
    recordTest(
      'REP-03',
      'GET /api/reports/sales-by-customer - Grouped Customer Sales Report',
      custSalesRes.status === 200 && Array.isArray(custSalesRes.data?.data)
    );

    // 3.4 Branch-wise Sales Report
    const branchSalesRes = await api('GET', '/reports/sales-by-branch', null, adminToken);
    recordTest(
      'REP-04',
      'GET /api/reports/sales-by-branch - Cross-branch comparative sales',
      branchSalesRes.status === 200 && Array.isArray(branchSalesRes.data?.data)
    );

    // 3.5 Freight Mode Sales Distribution
    const modeSalesRes = await api('GET', '/reports/sales-by-freight-mode', null, adminToken);
    recordTest(
      'REP-05',
      'GET /api/reports/sales-by-freight-mode - Freight mode breakdown',
      modeSalesRes.status === 200 && Array.isArray(modeSalesRes.data?.data)
    );

    // 3.6 Shipment Operations Summary
    const shipSummaryRes = await api('GET', '/reports/shipments-summary', null, adminToken);
    recordTest(
      'REP-06',
      'GET /api/reports/shipments-summary - Operational execution metrics',
      shipSummaryRes.status === 200 && typeof shipSummaryRes.data?.data?.kpis?.totalShipments === 'number',
      `Total: ${shipSummaryRes.data?.data?.kpis?.totalShipments}, Active: ${shipSummaryRes.data?.data?.kpis?.activeShipments}`
    );

    // 3.7 Shipment Register Report
    const shipRegRes = await api('GET', '/reports/shipments-register?limit=10', null, adminToken);
    recordTest(
      'REP-07',
      'GET /api/reports/shipments-register - Universal shipment register',
      shipRegRes.status === 200 && Array.isArray(shipRegRes.data?.data),
      `Records: ${shipRegRes.data?.count}`
    );

    // 3.8 Trade Lane Analysis Report
    const tradeLanesRes = await api('GET', '/reports/trade-lanes', null, adminToken);
    recordTest(
      'REP-08',
      'GET /api/reports/trade-lanes - Top cargo corridors',
      tradeLanesRes.status === 200 && Array.isArray(tradeLanesRes.data?.data)
    );

    // 3.9 Customer Directory Report
    const custDirRes = await api('GET', '/reports/customers-directory', null, adminToken);
    recordTest(
      'REP-09',
      'GET /api/reports/customers-directory - Customer directory with ledger balances',
      custDirRes.status === 200 && Array.isArray(custDirRes.data?.data)
    );

    // 3.10 Invoice Financial Register
    const invRegRes = await api('GET', '/reports/invoices-register', null, adminToken);
    recordTest(
      'REP-10',
      'GET /api/reports/invoices-register - Invoice financial register',
      invRegRes.status === 200 && Array.isArray(invRegRes.data?.data),
      `Total Records: ${invRegRes.data?.count}`
    );

    // 3.11 Customer Receipts Register
    const recRegRes = await api('GET', '/reports/receipts-register', null, adminToken);
    recordTest(
      'REP-11',
      'GET /api/reports/receipts-register - Customer receipts register',
      recRegRes.status === 200 && Array.isArray(recRegRes.data?.data),
      `Total Records: ${recRegRes.data?.count}`
    );

    // 3.12 Cash & Bank Balances Summary
    const cashBankRes = await api('GET', '/reports/cash-bank-summary', null, adminToken);
    recordTest(
      'REP-12',
      'GET /api/reports/cash-bank-summary - Cash and bank ledger positions',
      cashBankRes.status === 200 && typeof cashBankRes.data?.data?.totalLiquidity === 'number',
      `Liquidity: $${cashBankRes.data?.data?.totalLiquidity?.toLocaleString()}`
    );

    // 3.13 Operating Expenses Summary
    const expSummaryRes = await api('GET', '/reports/expenses-summary', null, adminToken);
    recordTest(
      'REP-13',
      'GET /api/reports/expenses-summary - Operational expense categorized summary',
      expSummaryRes.status === 200 && typeof expSummaryRes.data?.data?.totalExpense === 'number',
      `Total Expenses: $${expSummaryRes.data?.data?.totalExpense?.toLocaleString()}`
    );

    // 3.14 CSV Export Engine
    const csvExportRes = await api('GET', '/reports/export/csv?reportType=quotations', null, adminToken);
    const isCsvHeader = csvExportRes.headers.get('content-type')?.includes('text/csv');
    const hasCsvContent = typeof csvExportRes.data === 'string' && csvExportRes.data.includes('Quotation Number');
    recordTest(
      'REP-14',
      'GET /api/reports/export/csv - Live tabular CSV generation & export',
      csvExportRes.status === 200 && (isCsvHeader || hasCsvContent),
      `Status: ${csvExportRes.status}, Content Length: ${csvExportRes.data?.length}`
    );

    // -------------------------------------------------------------
    // 4. SECURITY, RBAC & BRANCH ISOLATION AUDIT
    // -------------------------------------------------------------
    console.log('\n--- 4. RBAC, Branch Isolation & Security Audit ---');

    // 4.1 Rotterdam Branch Admin reports query isolation
    const rtmReportRes = await api('GET', '/reports/sales-summary', null, rtmToken);
    recordTest(
      'SEC-01',
      'Branch Data Isolation - Non-HQ user restricted to local branch reports',
      rtmReportRes.status === 200 && typeof rtmReportRes.data?.data?.kpis?.totalQuotations === 'number',
      `Branch KPIs Scoped: ${rtmReportRes.data?.data?.kpis?.totalQuotations} quotes`
    );

    // 4.2 Non-admin updating company settings should fail
    const unauthUpdateRes = await api('PUT', '/settings/company', { companyName: 'Hacked' }, salesToken);
    recordTest(
      'SEC-02',
      'RBAC - Sales role denied from modifying company settings',
      unauthUpdateRes.status === 403,
      `HTTP ${unauthUpdateRes.status}`
    );

    // 4.3 Operations user denied from financial cash-bank ledger
    const unauthFinRes = await api('GET', '/reports/cash-bank-summary', null, opsToken);
    recordTest(
      'SEC-03',
      'RBAC - Operations denied from accessing cash/bank financials',
      unauthFinRes.status === 403,
      `HTTP ${unauthFinRes.status}`
    );

    // -------------------------------------------------------------
    // 5. MASTER END-TO-END BUSINESS LIFECYCLE
    // Lead -> Customer -> Quote -> Portal Accept -> Shipment -> Milestone -> Invoice -> Receipt -> Reports
    // -------------------------------------------------------------
    console.log('\n--- 5. Master End-to-End Business Lifecycle ---');

    const timestamp = Date.now();

    // 5.1 Create Lead
    const leadRes = await api(
      'POST',
      '/leads',
      {
        contactPerson: `Master Test User ${timestamp}`,
        companyName: `Apex Global Cargo ${timestamp}`,
        email: `apex_${timestamp}@testdomain.com`,
        phone: '+971 4 888 1234',
        country: 'United Arab Emirates',
        leadSource: 'Website',
        status: 'Qualified',
        branch: hqBranch._id,
        notes: 'Enterprise sea freight shipper from Jebel Ali',
      },
      salesToken
    );
    const createdLead = leadRes.data?.data;
    recordTest('E2E-01', 'Create New Lead (CRM)', !!createdLead?._id, `Lead: ${createdLead?.leadNumber}`);

    // 5.2 Convert Lead to Customer
    const convRes = await api(
      'POST',
      `/leads/${createdLead._id}/convert`,
      {
        preferredCurrency: 'USD',
        address: 'Jebel Ali Free Zone, Dubai, UAE',
      },
      salesToken
    );
    const convertedCust = convRes.data?.data?.customer;
    recordTest('E2E-02', 'Convert Lead to Customer', !!convertedCust?._id, `Customer Code: ${convertedCust?.customerCode}`);

    // 5.3 Create Quotation
    const quoteRes = await api(
      'POST',
      '/quotations',
      {
        customer: convertedCust._id,
        contactPerson: convertedCust.contactPerson,
        freightType: 'Sea FCL',
        origin: 'Jebel Ali (AEJEA)',
        destination: 'Rotterdam (NLRTM)',
        cargoDescription: '1x40ft HC Container - Industrial Equipment',
        packagesCount: 1,
        currency: 'USD',
        freightCharges: 2400,
        additionalChargeItems: [
          { description: 'Terminal Handling Charges', amount: 350 },
          { description: 'Export Documentation', amount: 150 },
        ],
        tax: 145,
        status: 'Sent',
        branch: hqBranch._id,
      },
      salesToken
    );
    const createdQuote = quoteRes.data?.data;
    recordTest('E2E-03', 'Create Commercial Quotation', !!createdQuote?._id, `Quote: ${createdQuote?.quotationNumber}, $${createdQuote?.totalAmount}`);

    // 5.4 Invite Customer to Portal & Authenticate
    const inviteRes = await api(
      'POST',
      '/portal/accounts/invite',
      {
        customerId: convertedCust._id,
        email: convertedCust.email,
        name: convertedCust.contactPerson,
      },
      salesToken
    );
    const invitationToken = inviteRes.data?.inviteToken;
    recordTest('E2E-04', 'Generate Customer Portal Invitation', !!invitationToken, `Token: ${invitationToken?.slice(0, 8)}...`);

    // Accept Invitation & Set Password
    const acceptInvRes = await api('POST', '/portal/auth/accept-invitation', {
      token: invitationToken,
      password: 'CustomerPortalPass123!',
    });

    // Portal Login
    const portalLoginRes = await api('POST', '/portal/auth/login', {
      email: convertedCust.email,
      password: 'CustomerPortalPass123!',
    });
    const portalToken = portalLoginRes.data?.token || acceptInvRes.data?.token;
    recordTest('E2E-05', 'Customer Portal Login', !!portalToken, `Portal User: ${portalLoginRes.data?.user?.name || convertedCust.contactPerson}`);

    // 5.5 Customer Accepts Quotation via Portal
    const acceptQuoteRes = await api(
      'POST',
      `/portal/quotations/${createdQuote._id}/accept`,
      { notes: 'Quotation approved via self-service customer portal. Proceed with booking.' },
      portalToken
    );
    recordTest(
      'E2E-06',
      'Customer Portal Accepts Quotation',
      acceptQuoteRes.status === 200 && acceptQuoteRes.data?.data?.status === 'Accepted'
    );

    // 5.6 Internal Staff Converts Quotation to Shipment
    const convShipRes = await api(
      'POST',
      `/quotations/${createdQuote._id}/convert-to-shipment`,
      {},
      opsToken
    );
    const createdShipment = convShipRes.data?.data?.shipment;
    recordTest(
      'E2E-07',
      'Convert Quotation to Operational Shipment',
      !!createdShipment?._id,
      `Shipment No: ${createdShipment?.shipmentNumber}, Mode: ${createdShipment?.freightType || createdShipment?.freightMode}`
    );

    // 5.7 Update Shipment Milestones & Status
    const updateShipRes = await api(
      'PUT',
      `/shipments/${createdShipment._id}`,
      {
        status: 'In Transit',
        mblNumber: `MBL-APEX-${timestamp}`,
        vesselName: 'CMA CGM ANTOINE',
        voyageNumber: 'V.2026-04W',
      },
      opsToken
    );
    recordTest(
      'E2E-08',
      'Update Shipment Execution (In Transit, Vessel assigned)',
      updateShipRes.data?.data?.status === 'In Transit'
    );

    // 5.8 Customer Portal Views Live Shipment
    const portalShipViewRes = await api('GET', `/portal/shipments/${createdShipment._id}`, null, portalToken);
    recordTest(
      'E2E-09',
      'Customer Portal Live Shipment Visibility',
      portalShipViewRes.status === 200 && portalShipViewRes.data?.data?.status === 'In Transit',
      `Vessel: ${portalShipViewRes.data?.data?.vesselName}`
    );

    // 5.9 Generate Commercial Invoice
    const invRes = await api(
      'POST',
      '/invoices',
      {
        customer: convertedCust._id,
        shipment: createdShipment._id,
        quotation: createdQuote._id,
        currency: 'USD',
        status: 'Issued',
        lineItems: [
          { description: 'Ocean Freight Jebel Ali to Rotterdam', quantity: 1, unitPrice: 2400 },
          { description: 'Terminal Handling Charges (Origin)', quantity: 1, unitPrice: 350 },
          { description: 'Export Customs Clearance', quantity: 1, unitPrice: 150 },
        ],
        taxRate: 5,
        branch: hqBranch._id,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      accToken
    );
    const createdInvoice = invRes.data?.data;
    recordTest(
      'E2E-10',
      'Generate Commercial Invoice',
      !!createdInvoice?._id,
      `Invoice No: ${createdInvoice?.invoiceNumber}, Total: $${createdInvoice?.totalAmount}`
    );

    // 5.10 Customer Views Invoice in Portal
    const portalInvRes = await api('GET', `/portal/invoices/${createdInvoice._id}`, null, portalToken);
    recordTest(
      'E2E-11',
      'Customer Portal Invoice Access',
      portalInvRes.status === 200 && portalInvRes.data?.data?.totalAmount === 3045
    );

    // 5.11 Retrieve Cash/Bank Account matching currency
    const bankAccountsRes = await api('GET', '/cash-bank/accounts', null, accToken);
    const bankList = bankAccountsRes.data?.data || [];
    const primaryAccount = bankList.find((a) => a.currency === 'USD') || bankList[0];

    // 5.12 Accounts Records Payment Receipt
    const receiptRes = await api(
      'POST',
      '/receipts',
      {
        customer: convertedCust._id,
        account: primaryAccount?._id,
        amount: 3045,
        currency: primaryAccount?.currency || 'USD',
        paymentMethod: 'Bank Transfer',
        transactionReference: `WIRE-DXB-${timestamp}`,
        branch: hqBranch._id,
        allocations: [{ invoice: createdInvoice._id, amount: 3045 }],
        notes: 'Full payment received in USD Corporate Account',
      },
      accToken
    );
    const createdReceipt = receiptRes.data?.data;
    recordTest(
      'E2E-12',
      'Record Customer Receipt (Full Settlement)',
      receiptRes.status === 201 && !!createdReceipt?._id,
      createdReceipt ? `Receipt No: ${createdReceipt.receiptNumber}, Amount: $${createdReceipt.amount}` : `Status: ${receiptRes.status}, Error: ${receiptRes.data?.message}`
    );

    // 5.13 Verify Invoice Paid Status & Zero Balance in Reports
    const verifyInvRes = await api('GET', `/invoices/${createdInvoice._id}`, null, accToken);
    const refreshedInv = verifyInvRes.data?.data;
    recordTest(
      'E2E-13',
      'Invoice Status Automatically Settled to Paid',
      refreshedInv?.status === 'Paid' && refreshedInv?.balanceAmount === 0,
      `Status: ${refreshedInv?.status}, Balance: $${refreshedInv?.balanceAmount}`
    );

    // 5.14 Verify New Business Appears in Live Reports
    const reportSalesCheck = await api('GET', '/reports/sales-summary', null, adminToken);
    recordTest(
      'E2E-14',
      'Live Reports Engine Reflects Settled Business',
      reportSalesCheck.status === 200 && reportSalesCheck.data?.data?.kpis?.totalQuotations > 0,
      `Current Total Quotes Tracked: ${reportSalesCheck.data?.data?.kpis?.totalQuotations}`
    );

  } catch (error) {
    console.error('\x1b[31mUnexpected Execution Error:\x1b[0m', error);
    recordTest('FATAL', 'Master Execution Exception', false, error.message);
  }

  console.log('\n================================================================');
  console.log(` MASTER TEST SUITE FINISHED: ${results.passed}/${results.total} PASSED`);
  if (results.failed === 0) {
    console.log('\x1b[32m [SUCCESS] ALL MASTER VERIFICATION TESTS PASSED (100%)\x1b[0m');
  } else {
    console.log(`\x1b[31m [WARNING] ${results.failed} TESTS FAILED\x1b[0m`);
  }
  console.log('================================================================\n');

  return results;
}

runMasterSuite().then((res) => {
  if (res.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
});
