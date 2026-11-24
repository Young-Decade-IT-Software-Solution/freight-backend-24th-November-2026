import http from 'http';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const isPdf = res.headers['content-type']?.includes('application/pdf');
      if (isPdf) {
        let size = 0;
        res.on('data', (chunk) => (size += chunk.length));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, pdfSize: size }));
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
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runPhase2Tests() {
  console.log('=== STARTING PHASE 2 AUTOMATED TEST SUITE ===\n');
  const port = 5000;

  // 1. Authenticate as Super Admin
  console.log('1. Authenticating as Super Admin...');
  const loginRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@freighterp.com', password: 'Freight123!' }
  );
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error('Super Admin login failed');
  }
  const token = loginRes.data.token;
  console.log('   Authenticated successfully. Token acquired.\n');

  // 2. Lead Management: Create Lead
  console.log('2. Testing Lead Management: Create Lead...');
  const newLeadRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/leads',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    {
      contactPerson: 'Sophie Marchand',
      companyName: 'Bordeaux Fine Wines SAS',
      email: 'logistics@bordeauxwines.fr',
      phone: '+33 5 56 00 00 01',
      country: 'France',
      leadSource: 'Exhibition',
      status: 'Qualified',
      notes: 'Requires 2 temperature-controlled reefer containers monthly to Dubai.',
    }
  );
  console.log(`   Create Lead Status: ${newLeadRes.status}, Lead #: ${newLeadRes.data?.data?.leadNumber}`);
  if (newLeadRes.status !== 201 || !newLeadRes.data?.data?._id) {
    throw new Error('Create Lead failed: ' + JSON.stringify(newLeadRes.data));
  }
  const testLead = newLeadRes.data.data;

  // 3. Lead Conversion to Customer
  console.log('\n3. Testing Lead-to-Customer Conversion...');
  const convertRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/leads/${testLead._id}/convert`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { address: '12 Rue de la Gironde, Bordeaux', currency: 'EUR' }
  );
  console.log(`   Convert Status: ${convertRes.status}, Customer Code: ${convertRes.data?.data?.customer?.customerCode}`);
  if (convertRes.status !== 200 || !convertRes.data?.data?.customer) {
    throw new Error('Lead conversion failed');
  }
  const convertedCustomer = convertRes.data.data.customer;

  // Duplicate conversion prevention check
  console.log('   Verifying Duplicate Conversion Prevention...');
  const dupConvertRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/leads/${testLead._id}/convert`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    {}
  );
  console.log(`   Duplicate Conversion Status: ${dupConvertRes.status} (Expected 400 rejection: "${dupConvertRes.data?.message}")`);
  if (dupConvertRes.status !== 400) {
    throw new Error('Duplicate conversion prevention failed');
  }

  // 4. Follow-Up Management
  console.log('\n4. Testing Follow-Up Creation & Query...');
  const followUpRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/follow-ups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    {
      targetType: 'Customer',
      customerId: convertedCustomer._id,
      followUpDate: new Date(Date.now() + 86400000).toISOString(),
      notes: 'Confirm customs broker registration in Jebel Ali.',
    }
  );
  console.log(`   Create Follow-Up Status: ${followUpRes.status}, ID: ${followUpRes.data?.data?._id}`);
  if (followUpRes.status !== 201) throw new Error('Create follow-up failed');

  // Query upcoming follow-ups
  const listFollowRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/follow-ups?filter=upcoming',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   Upcoming Follow-Ups Count: ${listFollowRes.data?.count}`);
  if (listFollowRes.status !== 200) throw new Error('List follow-ups failed');

  // 5. Quotation Calculation Engine & Creation
  console.log('\n5. Testing Quotation Calculation Engine & Creation...');
  // Freight = 4200, Additional = 350 (Documentation) + 200 (Handling) = 550, Tax = 237.5, Discount = 150
  // Total = 4200 + 550 + 237.5 - 150 = 4837.5
  const quotePayload = {
    customer: convertedCustomer._id,
    contactPerson: convertedCustomer.contactPerson,
    freightType: 'Sea FCL',
    origin: 'Port of Bordeaux (FRBOD)',
    destination: 'Jebel Ali Port, Dubai (AEJEA)',
    cargoDescription: '2x40ft Reefer Fine Vintage Bordeaux Wines',
    grossWeight: 38000,
    volumeCbm: 110,
    packagesCount: 1800,
    currency: 'EUR',
    freightCharges: 4200,
    additionalChargeItems: [
      { description: 'Export Documentation & Certificate of Origin', amount: 350 },
      { description: 'Terminal Reefer Monitoring & Handling', amount: 200 },
    ],
    tax: 237.5,
    discount: 150,
    validityDate: new Date(Date.now() + 21 * 86400000).toISOString(),
    termsAndConditions: 'Subject to continuous reefer power supply at +14C throughout transit.',
  };

  const createQuoteRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/quotations',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    quotePayload
  );
  console.log(`   Create Quotation Status: ${createQuoteRes.status}, Quote #: ${createQuoteRes.data?.data?.quotationNumber}`);
  console.log(`   Calculated Total Amount: ${createQuoteRes.data?.data?.totalAmount} EUR (Expected: 4837.5)`);
  if (createQuoteRes.status !== 201 || createQuoteRes.data?.data?.totalAmount !== 4837.5) {
    throw new Error('Quotation creation or calculation engine failed');
  }
  const testQuotation = createQuoteRes.data.data;

  // 6. Quotation PDF Generation
  console.log('\n6. Testing Quotation PDF Generation...');
  const pdfRes = await request({
    hostname: '127.0.0.1',
    port,
    path: `/api/quotations/${testQuotation._id}/pdf`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   PDF Status: ${pdfRes.status}, Content-Type: ${pdfRes.headers['content-type']}, Size: ${pdfRes.pdfSize} bytes`);
  if (pdfRes.status !== 200 || !pdfRes.pdfSize || pdfRes.pdfSize < 500) {
    throw new Error('Quotation PDF generation failed');
  }

  // 7. Quotation Status Update & Email Dispatch
  console.log('\n7. Testing Quotation Email Dispatch & Status Transition...');
  const emailRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/quotations/${testQuotation._id}/send-email`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { email: 'procurement@bordeauxwines.fr' }
  );
  console.log(`   Email Dispatch Status: ${emailRes.status}, Message: "${emailRes.data?.message}"`);
  if (emailRes.status !== 200) throw new Error('Quotation email dispatch failed');

  // Customer accepts quotation
  console.log('   Updating Quotation Status to "Accepted"...');
  const acceptRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/quotations/${testQuotation._id}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { status: 'Accepted' }
  );
  console.log(`   Quotation Status: ${acceptRes.data?.data?.status}`);
  if (acceptRes.status !== 200 || acceptRes.data?.data?.status !== 'Accepted') {
    throw new Error('Quotation status update failed');
  }

  // 8. Quotation Revision / Duplication Check
  console.log('\n8. Testing Quotation Revision Duplication...');
  const revRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/quotations/${testQuotation._id}/duplicate`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { isRevision: true }
  );
  console.log(`   Revision Status: ${revRes.status}, Revision Quote #: ${revRes.data?.data?.quotationNumber}`);
  if (revRes.status !== 201 || !revRes.data?.data?.quotationNumber.includes('-R2')) {
    throw new Error('Quotation revision failed');
  }

  // 9. Quotation to Shipment Conversion
  console.log('\n9. Testing Quotation to Shipment Conversion...');
  const convertShipmentRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/quotations/${testQuotation._id}/convert-to-shipment`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { consignee: 'Gulf Fine Spirits Distribution LLC' }
  );
  console.log(`   Convert-to-Shipment Status: ${convertShipmentRes.status}, Shipment #: ${convertShipmentRes.data?.data?.shipment?.shipmentNumber}`);
  if (convertShipmentRes.status !== 201 || !convertShipmentRes.data?.data?.shipment?.shipmentNumber) {
    throw new Error('Quotation to shipment conversion failed');
  }
  const createdShipment = convertShipmentRes.data.data.shipment;
  console.log(`   Carried Forward Freight: ${createdShipment.freightType}, Agreed Charges: ${createdShipment.agreedCharges} ${createdShipment.currency}`);

  // 10. Duplicate Shipment Prevention Test
  console.log('\n10. Testing Duplicate Shipment Prevention...');
  const dupShipmentRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: `/api/quotations/${testQuotation._id}/convert-to-shipment`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    {}
  );
  console.log(`   Duplicate Shipment Status: ${dupShipmentRes.status} (Expected 400 rejection: "${dupShipmentRes.data?.message}")`);
  if (dupShipmentRes.status !== 400) {
    throw new Error('Duplicate shipment conversion was not prevented!');
  }

  console.log('\n=== ALL PHASE 2 BACKEND INTEGRATION TESTS PASSED PERFECTLY ===\n');
  process.exit(0);
}

runPhase2Tests().catch((err) => {
  console.error('\nPhase 2 test suite failed:', err);
  process.exit(1);
});
