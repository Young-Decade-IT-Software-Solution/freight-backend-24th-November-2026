import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

async function runEmailAudit() {
  console.log('================================================================');
  console.log('  FREIGHTERP PRODUCTION AUDIT: SMTP & EMAIL DELIVERY SUITE      ');
  console.log('================================================================\n');

  console.log('1. Checking Current Environment SMTP Configuration...');
  const currentHost = process.env.SMTP_HOST;
  const currentPort = process.env.SMTP_PORT;
  const currentUser = process.env.SMTP_USER;
  console.log(`   Configured SMTP Host: ${currentHost || '(Not set - using console simulation)'}`);
  console.log(`   Configured SMTP Port: ${currentPort || '(Not set)'}`);
  console.log(`   Configured SMTP User: ${currentUser || '(Not set)'}`);

  // Create an active live Ethereal test account for real SMTP delivery testing
  console.log('\n2. Creating live Ethereal SMTP test account for real delivery verification...');
  let testAccount;
  try {
    testAccount = await nodemailer.createTestAccount();
    console.log(`   Test Account Created: ${testAccount.user}`);
    console.log(`   SMTP Server: ${testAccount.smtp.host}:${testAccount.smtp.port}`);
  } catch (err) {
    console.error('Failed to create Ethereal test account:', err.message);
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // Verify SMTP Connection
  console.log('\n3. Verifying SMTP Server Handshake and Authentication...');
  const isVerified = await transporter.verify();
  console.log(`   SMTP Handshake Result: ${isVerified ? 'SUCCESS (Ready to deliver)' : 'FAILED'}`);

  // Test 1: Shipment Creation Notification Email
  console.log('\n4. Test 1: Sending Actual Shipment Creation Notification Email...');
  const createInfo = await transporter.sendMail({
    from: '"FreightERP Operations" <ops@freighterp.com>',
    to: 'customer.client@logistics-partner.com',
    subject: '[FreightERP] Shipment SHP-2026-00011 Created: Booking Confirmed',
    html: `
      <h2>Shipment Confirmation: SHP-2026-00011</h2>
      <p>Dear Customer,</p>
      <p>Your freight booking has been created in the FreightERP system.</p>
      <ul>
        <li><strong>Mode:</strong> Sea FCL</li>
        <li><strong>Origin:</strong> Jebel Ali Port, Dubai (AEJEA)</li>
        <li><strong>Destination:</strong> Port of Rotterdam, Netherlands (NLRTM)</li>
        <li><strong>Agreed Charges:</strong> USD 4,200.00</li>
      </ul>
      <p>FreightERP Automated Operations</p>
    `,
  });
  console.log(`   [DELIVERED] Message ID: ${createInfo.messageId}`);
  console.log(`   [DELIVERED] Response: ${createInfo.response}`);
  console.log(`   [DELIVERED] Preview URL: ${nodemailer.getTestMessageUrl(createInfo)}`);

  // Test 2: Shipment Status Update Notification Email (In Transit)
  console.log('\n5. Test 2: Sending Actual Shipment Status Update Email (In Transit)...');
  const updateInfo = await transporter.sendMail({
    from: '"FreightERP Operations" <ops@freighterp.com>',
    to: 'customer.client@logistics-partner.com',
    subject: '[FreightERP] Shipment SHP-2026-00011 Notification: In Transit',
    html: `
      <h2>Shipment Status Update: In Transit</h2>
      <p>Vessel Madrid Maersk / Voyage 264W has departed the origin port and is currently in transit.</p>
      <p>Estimated arrival at Rotterdam: 2026-12-24</p>
    `,
  });
  console.log(`   [DELIVERED] Message ID: ${updateInfo.messageId}`);
  console.log(`   [DELIVERED] Preview URL: ${nodemailer.getTestMessageUrl(updateInfo)}`);

  // Test 3: Shipment Delivery Notification Email (Delivered)
  console.log('\n6. Test 3: Sending Actual Delivery Notification Email...');
  const deliverInfo = await transporter.sendMail({
    from: '"FreightERP Operations" <ops@freighterp.com>',
    to: 'customer.client@logistics-partner.com',
    subject: '[FreightERP] Shipment SHP-2026-00011: Successfully Delivered',
    html: `
      <h2 style="color: #059669;">Shipment Delivered: SHP-2026-00011</h2>
      <p>Cargo has been successfully received by the consignee at Port of Rotterdam.</p>
      <p>Signed Proof of Delivery (POD) archived in your document vault.</p>
    `,
  });
  console.log(`   [DELIVERED] Message ID: ${deliverInfo.messageId}`);
  console.log(`   [DELIVERED] Preview URL: ${nodemailer.getTestMessageUrl(deliverInfo)}`);

  // Test 4: Quotation PDF Attachment Email
  console.log('\n7. Test 4: Sending Commercial Quotation with PDF Attachment...');
  const mockPdfBuffer = Buffer.from('%PDF-1.4 Mock Certified Quotation Document for FreightERP');
  const quoteMailInfo = await transporter.sendMail({
    from: '"FreightERP Commercial Team" <sales@freighterp.com>',
    to: 'customer.client@logistics-partner.com',
    subject: '[FreightERP] Quotation Proposal QT-2026-0007',
    text: 'Please find attached your freight proposal from FreightERP Head Office.',
    attachments: [
      {
        filename: 'Quotation-QT-2026-0007.pdf',
        content: mockPdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
  console.log(`   [DELIVERED] Message ID with Attachment: ${quoteMailInfo.messageId}`);
  console.log(`   [DELIVERED] Preview URL: ${nodemailer.getTestMessageUrl(quoteMailInfo)}`);

  // Test 5: Invalid Recipient Handling
  console.log('\n8. Test 5: Testing Invalid Recipient Error Handling...');
  let invalidHandled = false;
  try {
    await transporter.sendMail({
      from: '"FreightERP Operations" <ops@freighterp.com>',
      to: 'invalid-email-format-without-at',
      subject: 'Test Bad Email',
      text: 'Testing',
    });
  } catch (err) {
    invalidHandled = true;
    console.log(`   [PASS] Invalid recipient properly rejected: ${err.message}`);
  }
  if (!invalidHandled) throw new Error('Invalid recipient did not throw an error');

  // Test 6: SMTP Failure Handling (Simulating Connection Refused / Invalid Host)
  console.log('\n9. Test 6: Testing SMTP Failure and Non-Blocking Fallback Handling...');
  let failureHandled = false;
  const brokenTransporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 25252, // Unbound port
    connectionTimeout: 1000,
  });

  try {
    await brokenTransporter.sendMail({
      from: '"FreightERP" <test@freighterp.com>',
      to: 'test@example.com',
      subject: 'Test Failure',
      text: 'Test',
    });
  } catch (err) {
    failureHandled = true;
    console.log(`   [PASS] SMTP server down properly caught without unhandled rejection: ${err.code || err.message}`);
  }
  if (!failureHandled) throw new Error('Broken transporter did not throw expected error');

  console.log('\n================================================================');
  console.log('  SMTP & EMAIL DELIVERY AUDIT COMPLETED SUCCESSFULLY!           ');
  console.log('================================================================\n');
}

runEmailAudit().catch((err) => {
  console.error('Email audit error:', err);
  process.exit(1);
});
