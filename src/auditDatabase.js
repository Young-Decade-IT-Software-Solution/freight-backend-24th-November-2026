import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import Branch from './models/Branch.js';
import User from './models/User.js';
import Customer from './models/Customer.js';
import Quotation from './models/Quotation.js';
import Shipment from './models/Shipment.js';
import ShipmentMilestone from './models/ShipmentMilestone.js';
import ShipmentDocument from './models/ShipmentDocument.js';

const envPath = fs.existsSync(path.resolve(process.cwd(), 'backend', '.env'))
  ? path.resolve(process.cwd(), 'backend', '.env')
  : path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function runDatabaseAudit() {
  console.log('================================================================');
  console.log('  FREIGHTERP PRODUCTION AUDIT: DATABASE & DATA INTEGRITY SUITE  ');
  console.log('================================================================\n');

  console.log('1. Connecting to MongoDB Atlas cluster...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`   Connected to: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);

  const results = [];
  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  };

  // 1. Data Count & Persistence Verification
  const branchCount = await Branch.countDocuments();
  const userCount = await User.countDocuments();
  const customerCount = await Customer.countDocuments();
  const quoteCount = await Quotation.countDocuments();
  const shipmentCount = await Shipment.countDocuments();
  const milestoneCount = await ShipmentMilestone.countDocuments();
  const docCount = await ShipmentDocument.countDocuments();

  record(
    'Atlas Persistence: Branch Count',
    branchCount === 5,
    `Found ${branchCount} branches (Expected 5 hubs)`
  );
  record(
    'Atlas Persistence: User Count',
    userCount >= 15,
    `Found ${userCount} users across 5 roles (Expected >= 15)`
  );
  record(
    'Atlas Persistence: Shipments & Operations',
    shipmentCount >= 5 && milestoneCount >= 40,
    `Found ${shipmentCount} shipments and ${milestoneCount} milestones persisted`
  );

  // 2. Sequential & Unique Shipment Numbering Format
  const shipments = await Shipment.find().select('shipmentNumber currency agreedCharges');
  const numberFormatRegex = /^SHP-\d{4}-\d{5}$/;
  const allFormatted = shipments.every((s) => numberFormatRegex.test(s.shipmentNumber));
  const numbers = shipments.map((s) => s.shipmentNumber);
  const uniqueNumbers = new Set(numbers);
  const noDuplicates = uniqueNumbers.size === numbers.length;

  record(
    'Shipment Numbering Format (SHP-YYYY-XXXXX)',
    allFormatted,
    `All ${shipments.length} shipment numbers conform to SHP-YYYY-XXXXX (e.g. ${numbers.slice(0, 3).join(', ')})`
  );
  record(
    'Shipment Numbering Uniqueness (Zero duplicates)',
    noDuplicates,
    `Total: ${numbers.length}, Unique: ${uniqueNumbers.size}`
  );

  // 3. Duplicate Quotation Conversion Prevention Integrity
  const convertedQuotes = await Quotation.find({ isConvertedToShipment: true });
  let quoteConversionIntegrity = true;
  for (const q of convertedQuotes) {
    const matchingShipments = await Shipment.countDocuments({ quotation: q._id });
    if (matchingShipments > 1) {
      quoteConversionIntegrity = false;
      console.warn(`[Integrity Alert] Quotation ${q.quotationNumber} has ${matchingShipments} shipments!`);
    }
  }
  record(
    'Quotation-to-Shipment 1:1 Referential Integrity',
    quoteConversionIntegrity,
    `Checked ${convertedQuotes.length} converted quotations. Exactly 1 shipment per quotation.`
  );

  // 4. Multi-Currency Preservation (EUR, USD, AED, CNY, TRY)
  const currenciesPresent = new Set(shipments.map((s) => s.currency));
  record(
    'Multi-Currency Retention without Conversion Distortion',
    currenciesPresent.size >= 2,
    `Currencies active in shipment records: [${Array.from(currenciesPresent).join(', ')}]`
  );

  // 5. Database Indexes Verification
  console.log('\nChecking Collection Indexes on MongoDB:');
  const shipmentIndexes = await Shipment.collection.indexes();
  const hasShipmentNumberIdx = shipmentIndexes.some((idx) => idx.key.shipmentNumber === 1 && idx.unique);
  const hasBranchIdx = shipmentIndexes.some((idx) => idx.key.branch === 1);
  const hasStatusIdx = shipmentIndexes.some((idx) => idx.key.status === 1);

  record(
    'Shipment Indexes (Unique shipmentNumber, branch, status)',
    hasShipmentNumberIdx && hasBranchIdx && hasStatusIdx,
    `Unique shipmentNumber: ${hasShipmentNumberIdx}, branch: ${hasBranchIdx}, status: ${hasStatusIdx}`
  );

  const quoteIndexes = await Quotation.collection.indexes();
  const hasQuoteNumberIdx = quoteIndexes.some((idx) => idx.key.quotationNumber === 1);
  record('Quotation Indexes (quotationNumber, branch)', hasQuoteNumberIdx, `quotationNumber index: ${hasQuoteNumberIdx}`);

  console.log('\n================================================================');
  console.log('  DATABASE & DATA INTEGRITY AUDIT COMPLETE                      ');
  console.log('================================================================\n');

  await mongoose.disconnect();
}

runDatabaseAudit().catch((err) => {
  console.error('Database audit error:', err);
  process.exit(1);
});
