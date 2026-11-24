import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Models
import User from './models/User.js';
import Customer from './models/Customer.js';
import CustomerUser from './models/CustomerUser.js';
import Branch from './models/Branch.js';
import Quotation from './models/Quotation.js';
import Shipment from './models/Shipment.js';
import ShipmentMilestone from './models/ShipmentMilestone.js';
import ShipmentDocument from './models/ShipmentDocument.js';
import Invoice from './models/Invoice.js';
import CustomerReceipt from './models/CustomerReceipt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

let testsPassed = 0;
let testsFailed = 0;

function logTest(num, name, passed, detail = '') {
  if (passed) {
    testsPassed++;
    console.log(`[PASS] Test ${num.toString().padStart(2, '0')}: ${name}`);
  } else {
    testsFailed++;
    console.error(`[FAIL] Test ${num.toString().padStart(2, '0')}: ${name} - ${detail}`);
  }
}

async function runPhase5Audit() {
  console.log('\n=============================================================');
  console.log('   FreightERP — PHASE 5 CUSTOMER PORTAL COMPREHENSIVE AUDIT');
  console.log('=============================================================\n');

  try {
    const mongoUri =
      process.env.MONGODB_URI ||
      'mongodb://127.0.0.1:27017/freighterp';
    await mongoose.connect(mongoUri);
    console.log('[DB] Connected to MongoDB Atlas cluster for Phase 5 test execution\n');

    // Setup / retrieve 2 different customers (Customer A and Customer B)
    const customers = await Customer.find().limit(2);
    if (customers.length < 2) {
      throw new Error('Need at least 2 customer records to test multi-tenant data isolation');
    }
    const customerA = customers[0];
    const customerB = customers[1];
    console.log(`[SETUP] Customer A: ${customerA.companyName} (${customerA._id})`);
    console.log(`[SETUP] Customer B: ${customerB.companyName} (${customerB._id})`);

    // Retrieve or seed staff admin
    const staffAdmin = await User.findOne({ role: 'Super Admin' });
    if (!staffAdmin) throw new Error('Super Admin user required in DB');

    // Staff Login
    const staffLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffAdmin.email, password: 'Freight123!' }),
    });
    const staffLoginData = await staffLoginRes.json();
    const staffToken = staffLoginData.token;

    // Seed or retrieve CustomerUser A
    let userA = await CustomerUser.findOne({ email: 'sarah@apexglobal.com' });
    if (!userA) {
      userA = await CustomerUser.create({
        name: 'Sarah Jenkins',
        email: 'sarah@apexglobal.com',
        password: 'Freight123!',
        customer: customerA._id,
        phone: '+971 50 111 2233',
        status: 'Active',
      });
    } else {
      userA.password = 'Freight123!';
      userA.status = 'Active';
      userA.customer = customerA._id;
      await userA.save();
    }

    // Seed or retrieve CustomerUser B
    let userB = await CustomerUser.findOne({ email: 'alex@orienttrades.com' });
    if (!userB) {
      userB = await CustomerUser.create({
        name: 'Alex Rivera',
        email: 'alex@orienttrades.com',
        password: 'Freight123!',
        customer: customerB._id,
        phone: '+971 50 444 5566',
        status: 'Active',
      });
    } else {
      userB.password = 'Freight123!';
      userB.status = 'Active';
      userB.customer = customerB._id;
      await userB.save();
    }

    // Seed Suspended CustomerUser
    let userSuspended = await CustomerUser.findOne({ email: 'suspended@apexglobal.com' });
    if (!userSuspended) {
      userSuspended = await CustomerUser.create({
        name: 'Suspended User',
        email: 'suspended@apexglobal.com',
        password: 'Freight123!',
        customer: customerA._id,
        status: 'Suspended',
      });
    } else {
      userSuspended.status = 'Suspended';
      await userSuspended.save();
    }

    // SECTION 1: AUTHENTICATION & TOKEN SEPARATION
    console.log('\n--- SECTION 1: Authentication & Strict Token Separation ---');

    // Test 1: Customer Portal Login Success
    let loginARes = await fetch(`${BASE_URL}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@apexglobal.com', password: 'Freight123!' }),
    });
    let loginAData = await loginARes.json();
    const tokenA = loginAData.token;
    logTest(1, 'Customer User A portal login succeeds', loginARes.status === 200 && !!tokenA);

    // Test 2: Customer User B login succeeds
    let loginBRes = await fetch(`${BASE_URL}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex@orienttrades.com', password: 'Freight123!' }),
    });
    let loginBData = await loginBRes.json();
    const tokenB = loginBData.token;
    logTest(2, 'Customer User B portal login succeeds', loginBRes.status === 200 && !!tokenB);

    // Test 3: Reject invalid password
    let badPwRes = await fetch(`${BASE_URL}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@apexglobal.com', password: 'WrongPassword!' }),
    });
    logTest(3, 'Portal login rejects invalid password (401)', badPwRes.status === 401);

    // Test 4: Reject suspended customer account
    let suspRes = await fetch(`${BASE_URL}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suspended@apexglobal.com', password: 'Freight123!' }),
    });
    logTest(4, 'Portal login rejects Suspended account (403)', suspRes.status === 403);

    // Test 5: Verify portal session /api/portal/auth/me
    let meRes = await fetch(`${BASE_URL}/portal/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let meData = await meRes.json();
    logTest(
      5,
      'Get current portal user profile (/api/portal/auth/me)',
      meRes.status === 200 && meData.user?.email === 'sarah@apexglobal.com'
    );

    // Test 6: Bidirectional Auth Barrier: Customer token cannot access internal ERP operations
    let internalProbeRes = await fetch(`${BASE_URL}/shipments`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      6,
      'Customer token rejected on internal staff route /api/shipments (403)',
      internalProbeRes.status === 403
    );

    // Test 7: Bidirectional Auth Barrier: Staff token cannot access customer portal routes
    let portalStaffProbeRes = await fetch(`${BASE_URL}/portal/dashboard`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    logTest(
      7,
      'Internal staff token rejected on /api/portal/dashboard (403)',
      portalStaffProbeRes.status === 403
    );

    // Test 8: Unauthenticated portal request rejected
    let noAuthRes = await fetch(`${BASE_URL}/portal/dashboard`);
    logTest(8, 'Unauthenticated request to portal rejected (401)', noAuthRes.status === 401);

    // SECTION 2: INVITATION & ACTIVATION WORKFLOW
    console.log('\n--- SECTION 2: Staff Invitation & Portal Onboarding ---');

    // Test 9: Staff creates invitation for new customer contact
    const inviteEmail = `invite_${Date.now()}@apexglobal.com`;
    let inviteRes = await fetch(`${BASE_URL}/portal/accounts/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        customerId: customerA._id,
        name: 'Onboarding Test User',
        email: inviteEmail,
        phone: '+971 50 999 8888',
      }),
    });
    let inviteData = await inviteRes.json();
    const rawInviteToken = inviteData.inviteToken;
    logTest(
      9,
      'Staff generates customer portal invitation',
      inviteRes.status === 201 && !!rawInviteToken && inviteData.data?.status === 'Pending'
    );

    // Test 10: Verify invitation token endpoint
    let verifyTokenRes = await fetch(`${BASE_URL}/portal/auth/verify-invitation/${rawInviteToken}`);
    let verifyTokenData = await verifyTokenRes.json();
    logTest(
      10,
      'Verify raw invitation token endpoint succeeds',
      verifyTokenRes.status === 200 && verifyTokenData.user?.email === inviteEmail
    );

    // Test 11: Accept invitation and activate account
    let acceptInviteRes = await fetch(`${BASE_URL}/portal/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawInviteToken,
        password: 'NewCustomerPass123!',
        name: 'Activated User',
      }),
    });
    let acceptInviteData = await acceptInviteRes.json();
    logTest(
      11,
      'Accept invitation activates account and returns valid session',
      acceptInviteRes.status === 200 && acceptInviteData.user?.status === 'Active' && !!acceptInviteData.token
    );

    // Test 12: Re-using spent invitation token is rejected
    let reuseTokenRes = await fetch(`${BASE_URL}/portal/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawInviteToken,
        password: 'NewCustomerPass123!',
      }),
    });
    logTest(12, 'Re-using consumed invitation token is rejected (400)', reuseTokenRes.status === 400);

    // Test 13: Staff lists portal accounts
    let accountsListRes = await fetch(`${BASE_URL}/portal/accounts`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    let accountsListData = await accountsListRes.json();
    logTest(13, 'Staff lists customer portal accounts', accountsListRes.status === 200 && Array.isArray(accountsListData.data));

    // Test 14: Forgot password workflow
    let forgotRes = await fetch(`${BASE_URL}/portal/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    });
    let forgotData = await forgotRes.json();
    const rawResetToken = forgotData.resetToken;
    logTest(14, 'Customer requested password reset link generated', forgotRes.status === 200 && !!rawResetToken);

    // Test 15: Reset password with token
    let resetRes = await fetch(`${BASE_URL}/portal/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawResetToken, password: 'UpdatedPass456!' }),
    });
    logTest(15, 'Reset password updates customer credentials', resetRes.status === 200);

    // Test 16: Login with updated credentials
    let newLoginRes = await fetch(`${BASE_URL}/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, password: 'UpdatedPass456!' }),
    });
    logTest(16, 'Login with reset password succeeds', newLoginRes.status === 200);

    // SECTION 3: STRICT CUSTOMER DATA ISOLATION & DASHBOARD
    console.log('\n--- SECTION 3: Multi-Tenant Scoping & Dashboard ---');

    // Test 17: User A dashboard returns only Customer A metrics
    let dashARes = await fetch(`${BASE_URL}/portal/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let dashAData = await dashARes.json();
    logTest(
      17,
      'User A dashboard scoped strictly to Customer A',
      dashARes.status === 200 && dashAData.data?.company?.code === customerA.customerCode
    );

    // Test 18: User B dashboard returns only Customer B metrics
    let dashBRes = await fetch(`${BASE_URL}/portal/dashboard`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    let dashBData = await dashBRes.json();
    logTest(
      18,
      'User B dashboard scoped strictly to Customer B',
      dashBRes.status === 200 && dashBData.data?.company?.code === customerB.customerCode
    );

    // SECTION 4: SHIPMENTS & MILESTONE TRACKING
    console.log('\n--- SECTION 4: Shipments & Milestone Tracking Privacy ---');

    // Seed shipments for Customer A and Customer B
    const branch = await Branch.findOne();
    let shipmentA = await Shipment.findOne({ customer: customerA._id });
    if (!shipmentA) {
      shipmentA = await Shipment.create({
        shipmentNumber: `SHP-TEST-A-${Date.now()}`,
        customer: customerA._id,
        freightType: 'Sea Freight FCL',
        origin: 'Shanghai, China',
        destination: 'Jebel Ali, Dubai',
        status: 'In Transit',
        branch: branch._id,
        internalRemarks: 'SECRET INTERNAL PROFIT MARGIN 45%',
      });
    } else {
      shipmentA.internalRemarks = 'SECRET INTERNAL PROFIT MARGIN 45%';
      await shipmentA.save();
    }

    let shipmentB = await Shipment.findOne({ customer: customerB._id });
    if (!shipmentB) {
      shipmentB = await Shipment.create({
        shipmentNumber: `SHP-TEST-B-${Date.now()}`,
        customer: customerB._id,
        freightType: 'Air Freight',
        origin: 'Frankfurt, Germany',
        destination: 'Dubai Airport, UAE',
        status: 'Delivered',
        branch: branch._id,
        internalRemarks: 'CUSTOMER B CONFIDENTIAL VENDOR COST',
      });
    }

    // Test 19: User A shipment list contains only Customer A shipments
    let shipListARes = await fetch(`${BASE_URL}/portal/shipments`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let shipListAData = await shipListARes.json();
    const hasOnlyCustomerAShipments =
      shipListAData.data.length > 0 &&
      shipListAData.data.every((s) => s.customer === customerA._id.toString() || !s.customer);
    const hasNoCustomerBShipments = !shipListAData.data.some((s) => s._id === shipmentB._id.toString());
    logTest(
      19,
      'User A shipment listing contains zero Customer B records',
      shipListARes.status === 200 && hasOnlyCustomerAShipments && hasNoCustomerBShipments
    );

    // Test 20: User A cannot see internalRemarks
    const remarksExposed = shipListAData.data.some((s) => s.internalRemarks);
    logTest(20, 'Internal remarks stripped from portal shipment list', !remarksExposed);

    // Test 21: User A gets own shipment details
    let shipDetailARes = await fetch(`${BASE_URL}/portal/shipments/${shipmentA._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let shipDetailAData = await shipDetailARes.json();
    logTest(
      21,
      'User A accesses own shipment details with milestones',
      shipDetailARes.status === 200 && !shipDetailAData.data?.internalRemarks
    );

    // Test 22: User A attempts direct ID tampering to access Customer B shipment
    let tamperingShipRes = await fetch(`${BASE_URL}/portal/shipments/${shipmentB._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      22,
      'Cross-customer shipment ID tampering blocked (404/403)',
      tamperingShipRes.status === 404 || tamperingShipRes.status === 403
    );

    // Test 23: Milestones access control
    let milestonesARes = await fetch(`${BASE_URL}/portal/shipments/${shipmentA._id}/milestones`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(23, 'User A retrieves milestones for own shipment', milestonesARes.status === 200);

    // Test 24: Cross-customer milestone request blocked
    let tamperMilestonesRes = await fetch(`${BASE_URL}/portal/shipments/${shipmentB._id}/milestones`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(24, 'User A blocked from viewing Customer B milestones', tamperMilestonesRes.status === 404);

    // SECTION 5: DOCUMENT VISIBILITY & SECURITY
    console.log('\n--- SECTION 5: Document Privacy & Customer Visibility Flag ---');

    // Create a dummy physical file for test
    const dummyPath = path.resolve(__dirname, '../uploads/test-visible-doc.pdf');
    if (!fs.existsSync(path.dirname(dummyPath))) {
      fs.mkdirSync(path.dirname(dummyPath), { recursive: true });
    }
    fs.writeFileSync(dummyPath, '%PDF-1.4 test document content for portal audit');

    // Seed customer-visible document
    const visibleDoc = await ShipmentDocument.create({
      shipment: shipmentA._id,
      title: 'Commercial Bill of Lading (Customer Visible)',
      category: 'Bill of Lading',
      fileName: 'test-visible-doc.pdf',
      originalName: 'Bill_of_Lading_BL8829.pdf',
      filePath: dummyPath,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: staffAdmin._id,
      branch: branch._id,
      isCustomerVisible: true,
    });

    // Seed internal-only document (isCustomerVisible: false)
    const internalDoc = await ShipmentDocument.create({
      shipment: shipmentA._id,
      title: 'Carrier Procurement Net Rate Sheet (INTERNAL ONLY)',
      category: 'Other Documents',
      fileName: 'test-internal-doc.pdf',
      originalName: 'Carrier_Procurement_Rates.pdf',
      filePath: dummyPath,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: staffAdmin._id,
      branch: branch._id,
      isCustomerVisible: false,
    });

    // Test 25: User A document listing only includes isCustomerVisible: true
    let docsRes = await fetch(`${BASE_URL}/portal/documents`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let docsData = await docsRes.json();
    const hasVisible = docsData.data.some((d) => d._id === visibleDoc._id.toString());
    const hidesInternal = !docsData.data.some((d) => d._id === internalDoc._id.toString());
    logTest(
      25,
      'Document repository lists visible docs and hides internal-only docs',
      docsRes.status === 200 && hasVisible && hidesInternal
    );

    // Test 26: User A downloads customer-visible document
    let downloadVisibleRes = await fetch(`${BASE_URL}/portal/documents/${visibleDoc._id}/download`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(26, 'User A downloads customer-visible document (200 OK)', downloadVisibleRes.status === 200);

    // Test 27: User A blocked from downloading internal-only document
    let downloadInternalRes = await fetch(`${BASE_URL}/portal/documents/${internalDoc._id}/download`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      27,
      'Internal-only document download blocked for customer (403)',
      downloadInternalRes.status === 403
    );

    // SECTION 6: QUOTATIONS & ACCEPTANCE WORKFLOW
    console.log('\n--- SECTION 6: Quotations & Approval Workflow ---');

    // Seed Quotation A (Sent status)
    const quoteA = await Quotation.create({
      quotationNumber: `QT-PORTAL-A-${Date.now()}`,
      customer: customerA._id,
      freightType: 'Sea FCL',
      origin: 'Dubai Port',
      destination: 'Hamburg Port',
      charges: [{ description: 'Ocean Freight Rate', amount: 3500 }],
      totalAmount: 3500,
      currency: 'USD',
      status: 'Sent',
      validityDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days in future
      branch: branch._id,
      createdBy: staffAdmin._id,
    });

    // Seed Quotation B (Customer B)
    const quoteB = await Quotation.create({
      quotationNumber: `QT-PORTAL-B-${Date.now()}`,
      customer: customerB._id,
      freightType: 'Air',
      origin: 'Tokyo',
      destination: 'Dubai',
      charges: [{ description: 'Air Freight Rate', amount: 8200 }],
      totalAmount: 8200,
      currency: 'USD',
      status: 'Sent',
      branch: branch._id,
      createdBy: staffAdmin._id,
    });

    // Test 28: User A quotations list contains only Customer A quotations
    let quotesListRes = await fetch(`${BASE_URL}/portal/quotations`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let quotesListData = await quotesListRes.json();
    const hasOnlyAQuotes = quotesListData.data.every(
      (q) => q.customer === customerA._id.toString() || !q.customer
    );
    const hasNoBQuotes = !quotesListData.data.some((q) => q._id === quoteB._id.toString());
    logTest(
      28,
      'User A quotation list contains zero Customer B quotations',
      quotesListRes.status === 200 && hasOnlyAQuotes && hasNoBQuotes
    );

    // Test 29: Cross-customer quotation access blocked
    let tamperQuoteRes = await fetch(`${BASE_URL}/portal/quotations/${quoteB._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(29, 'Direct lookup of Customer B quotation blocked (404)', tamperQuoteRes.status === 404);

    // Test 30: User A accepts quotation
    let acceptQuoteRes = await fetch(`${BASE_URL}/portal/quotations/${quoteA._id}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let acceptQuoteData = await acceptQuoteRes.json();
    logTest(
      30,
      'Customer accepts quotation via portal (/accept)',
      acceptQuoteRes.status === 200 && acceptQuoteData.data?.status === 'Accepted'
    );

    // Test 31: Re-accepting already accepted quotation rejected
    let reAcceptQuoteRes = await fetch(`${BASE_URL}/portal/quotations/${quoteA._id}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      31,
      'Re-accepting already accepted quote rejected (400)',
      reAcceptQuoteRes.status === 400
    );

    // Seed Quote A2 for reject test
    const quoteA2 = await Quotation.create({
      quotationNumber: `QT-PORTAL-A2-${Date.now()}`,
      customer: customerA._id,
      origin: 'London',
      destination: 'Dubai',
      charges: [{ description: 'Air Freight Rate', amount: 1200 }],
      totalAmount: 1200,
      status: 'Sent',
      branch: branch._id,
      createdBy: staffAdmin._id,
    });

    // Test 32: Rejecting quote without reason rejected
    let rejectNoReasonRes = await fetch(`${BASE_URL}/portal/quotations/${quoteA2._id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ rejectionReason: '' }),
    });
    logTest(32, 'Decline quote requires mandatory rejectionReason (400)', rejectNoReasonRes.status === 400);

    // Test 33: Rejecting quote with reason succeeds
    let rejectQuoteRes = await fetch(`${BASE_URL}/portal/quotations/${quoteA2._id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ rejectionReason: 'Rate 20% higher than competitor offer' }),
    });
    let rejectQuoteData = await rejectQuoteRes.json();
    logTest(
      33,
      'Customer declines quotation with recorded reason',
      rejectQuoteRes.status === 200 && rejectQuoteData.data?.status === 'Rejected'
    );

    // Test 34: Customer quotation PDF stream
    let quotePdfRes = await fetch(`${BASE_URL}/portal/quotations/${quoteA._id}/pdf`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      34,
      'Quotation official PDF generated and streamed (200 OK)',
      quotePdfRes.status === 200 && quotePdfRes.headers.get('content-type')?.includes('application/pdf')
    );

    // SECTION 7: INVOICES & FINANCIAL PRIVACY
    console.log('\n--- SECTION 7: Invoices, Receipts & Accounting Privacy ---');

    // Seed Draft invoice for Customer A (MUST NOT BE SHOWN TO CUSTOMER)
    const draftInvoice = await Invoice.create({
      invoiceNumber: `INV-DRAFT-${Date.now()}`,
      customer: customerA._id,
      branch: branch._id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currency: 'USD',
      lineItems: [{ description: 'Draft Unapproved Charge', quantity: 1, unitPrice: 500, amount: 500 }],
      totalAmount: 500,
      balanceAmount: 500,
      status: 'Draft',
      internalNotes: 'INTERNAL CONFIDENTIAL TAX NOTE',
    });

    // Seed Issued invoice for Customer A
    const issuedInvoice = await Invoice.create({
      invoiceNumber: `INV-ISSUED-A-${Date.now()}`,
      customer: customerA._id,
      branch: branch._id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currency: 'USD',
      lineItems: [{ description: 'Ocean Freight FCL', quantity: 1, unitPrice: 2800, amount: 2800 }],
      totalAmount: 2800,
      balanceAmount: 2800,
      status: 'Issued',
      internalNotes: 'INTERNAL COLLECTION NOTE: CLIENT PROMISED NEXT WEEK',
    });

    // Seed Invoice for Customer B
    const invoiceB = await Invoice.create({
      invoiceNumber: `INV-ISSUED-B-${Date.now()}`,
      customer: customerB._id,
      branch: branch._id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currency: 'USD',
      lineItems: [{ description: 'Air Cargo Delivery', quantity: 1, unitPrice: 4200, amount: 4200 }],
      totalAmount: 4200,
      balanceAmount: 4200,
      status: 'Issued',
    });

    // Test 35: Invoices list excludes Draft invoices
    let invListRes = await fetch(`${BASE_URL}/portal/invoices`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    let invListData = await invListRes.json();
    const hidesDrafts = !invListData.data.some((inv) => inv.status === 'Draft');
    const showsIssued = invListData.data.some((inv) => inv._id === issuedInvoice._id.toString());
    logTest(
      35,
      'Customer invoice listing strictly excludes internal Draft invoices',
      invListRes.status === 200 && hidesDrafts && showsIssued
    );

    // Test 36: Cross-customer invoice isolation
    const hasCustomerBInvoices = invListData.data.some((inv) => inv._id === invoiceB._id.toString());
    logTest(36, 'Customer invoice listing strictly excludes Customer B invoices', !hasCustomerBInvoices);

    // Test 37: Direct lookup of Draft invoice blocked
    let tamperDraftRes = await fetch(`${BASE_URL}/portal/invoices/${draftInvoice._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(37, 'Direct ID lookup of Draft invoice blocked for customer (404)', tamperDraftRes.status === 404);

    // Test 38: Direct lookup of Customer B invoice blocked
    let tamperInvBRes = await fetch(`${BASE_URL}/portal/invoices/${invoiceB._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(38, 'Direct ID lookup of Customer B invoice blocked (404)', tamperInvBRes.status === 404);

    // Test 39: Customer downloads official invoice PDF
    let invPdfRes = await fetch(`${BASE_URL}/portal/invoices/${issuedInvoice._id}/pdf`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    logTest(
      39,
      'Customer downloads official invoice PDF (200 OK)',
      invPdfRes.status === 200 && invPdfRes.headers.get('content-type')?.includes('application/pdf')
    );

    // SECTION 8: PROFILE & CREDENTIAL UPDATE
    console.log('\n--- SECTION 8: Profile & Password Maintenance ---');

    // Test 40: Update permitted contact profile fields
    let updateProfileRes = await fetch(`${BASE_URL}/portal/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: 'Sarah Jenkins (Verified)',
        phone: '+971 50 777 9999',
        address: 'Al Quoz Industrial Area 3, Dubai, UAE',
      }),
    });
    let updateProfileData = await updateProfileRes.json();
    logTest(
      40,
      'Customer updates permitted profile contact information',
      updateProfileRes.status === 200 && updateProfileData.data?.user?.name === 'Sarah Jenkins (Verified)'
    );

    console.log('\n=============================================================');
    console.log(`   TOTAL TESTS: 40 | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
    console.log('=============================================================\n');

    await mongoose.disconnect();
    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('[AUDIT EXECUTION ERROR]:', err);
    process.exit(1);
  }
}

runPhase5Audit();
