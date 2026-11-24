import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/db.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import Lead from '../models/Lead.js';
import Quotation from '../models/Quotation.js';
import Shipment from '../models/Shipment.js';
import Invoice from '../models/Invoice.js';
import FollowUp from '../models/FollowUp.js';
import Activity from '../models/Activity.js';

dotenv.config();

export const seedDatabase = async () => {
  try {
    await connectDB();
    console.log('[Seed] Connected to database. Clearing existing collections...');

    await Promise.all([
      Branch.deleteMany({}),
      User.deleteMany({}),
      Customer.deleteMany({}),
      Lead.deleteMany({}),
      Quotation.deleteMany({}),
      Shipment.deleteMany({}),
      Invoice.deleteMany({}),
      FollowUp.deleteMany({}),
      Activity.deleteMany({}),
    ]);

    console.log('[Seed] Creating 5 Branches...');
    const branches = await Branch.insertMany([
      {
        name: 'Head Office',
        code: 'HQ-DXB',
        city: 'Dubai',
        country: 'United Arab Emirates',
        address: 'Suite 1204, Port Rashid Business Tower, Dubai Maritime City',
        phone: '+971 4 398 2211',
        email: 'headoffice@freighterp.com',
        isHeadOffice: true,
        isActive: true,
      },
      {
        name: 'Branch 2 - Rotterdam Port',
        code: 'BR-RTM',
        city: 'Rotterdam',
        country: 'Netherlands',
        address: 'Maasvlakte Logistics Zone, Haven 9200',
        phone: '+31 10 749 5500',
        email: 'rotterdam@freighterp.com',
        isHeadOffice: false,
        isActive: true,
      },
      {
        name: 'Branch 3 - Singapore Hub',
        code: 'BR-SIN',
        city: 'Singapore',
        country: 'Singapore',
        address: '10 Anson Road, International Plaza #28-01',
        phone: '+65 6789 1234',
        email: 'singapore@freighterp.com',
        isHeadOffice: false,
        isActive: true,
      },
      {
        name: 'Branch 4 - Shanghai Gateway',
        code: 'BR-SHA',
        city: 'Shanghai',
        country: 'China',
        address: 'No. 88 Century Avenue, Pudong New Area',
        phone: '+86 21 5888 9000',
        email: 'shanghai@freighterp.com',
        isHeadOffice: false,
        isActive: true,
      },
      {
        name: 'Branch 5 - Istanbul Hub',
        code: 'BR-IST',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Barbaros Bulvari, Besiktas No. 45',
        phone: '+90 212 345 6789',
        email: 'istanbul@freighterp.com',
        isHeadOffice: false,
        isActive: true,
      },
    ]);

    const [hq, br2, br3, br4, br5] = branches;
    console.log('[Seed] Created branches:', branches.map((b) => b.name).join(', '));

    console.log('[Seed] Creating 15 Users across 5 roles...');
    const defaultPassword = 'Freight123!';

    const usersToCreate = [
      // 1. Super Admin (Global access)
      {
        name: 'Alexander Sterling',
        email: 'admin@freighterp.com',
        password: defaultPassword,
        role: 'Super Admin',
        branch: hq._id,
        phone: '+971 50 111 2233',
        department: 'Executive Management',
      },
      // 2-6. Branch Admins (One per branch)
      {
        name: 'Tariq Al-Mansoor',
        email: 'manager.hq@freighterp.com',
        password: defaultPassword,
        role: 'Branch Admin',
        branch: hq._id,
        phone: '+971 50 222 3344',
        department: 'Branch Operations',
      },
      {
        name: 'Jan van der Meer',
        email: 'manager.rotterdam@freighterp.com',
        password: defaultPassword,
        role: 'Branch Admin',
        branch: br2._id,
        phone: '+31 6 1234 5678',
        department: 'Branch Operations',
      },
      {
        name: 'Grace Tan',
        email: 'manager.singapore@freighterp.com',
        password: defaultPassword,
        role: 'Branch Admin',
        branch: br3._id,
        phone: '+65 9123 4567',
        department: 'Branch Operations',
      },
      {
        name: 'Wei Zhang',
        email: 'manager.shanghai@freighterp.com',
        password: defaultPassword,
        role: 'Branch Admin',
        branch: br4._id,
        phone: '+86 138 0000 1111',
        department: 'Branch Operations',
      },
      {
        name: 'Mehmet Yilmaz',
        email: 'manager.istanbul@freighterp.com',
        password: defaultPassword,
        role: 'Branch Admin',
        branch: br5._id,
        phone: '+90 532 111 2233',
        department: 'Branch Operations',
      },
      // 7-9. Sales
      {
        name: 'Sarah Jenkins',
        email: 'sales.hq@freighterp.com',
        password: defaultPassword,
        role: 'Sales',
        branch: hq._id,
        phone: '+971 50 333 4455',
        department: 'Commercial Sales',
      },
      {
        name: 'Lars Bakker',
        email: 'sales.rotterdam@freighterp.com',
        password: defaultPassword,
        role: 'Sales',
        branch: br2._id,
        phone: '+31 6 2345 6789',
        department: 'Commercial Sales',
      },
      {
        name: 'Marcus Chen',
        email: 'sales.singapore@freighterp.com',
        password: defaultPassword,
        role: 'Sales',
        branch: br3._id,
        phone: '+65 9234 5678',
        department: 'Commercial Sales',
      },
      // 10-12. Operations
      {
        name: 'Omar Farooq',
        email: 'ops.hq@freighterp.com',
        password: defaultPassword,
        role: 'Operations',
        branch: hq._id,
        phone: '+971 50 444 5566',
        department: 'Freight Execution',
      },
      {
        name: 'Dirk De Jong',
        email: 'ops.rotterdam@freighterp.com',
        password: defaultPassword,
        role: 'Operations',
        branch: br2._id,
        phone: '+31 6 3456 7890',
        department: 'Port Logistics',
      },
      {
        name: 'Li Na',
        email: 'ops.shanghai@freighterp.com',
        password: defaultPassword,
        role: 'Operations',
        branch: br4._id,
        phone: '+86 139 1111 2222',
        department: 'Export Logistics',
      },
      // 13-15. Accounts
      {
        name: 'Fatima Al-Hashimi',
        email: 'accounts.hq@freighterp.com',
        password: defaultPassword,
        role: 'Accounts',
        branch: hq._id,
        phone: '+971 50 555 6677',
        department: 'Finance & Billing',
      },
      {
        name: 'Sophie Visser',
        email: 'accounts.rotterdam@freighterp.com',
        password: defaultPassword,
        role: 'Accounts',
        branch: br2._id,
        phone: '+31 6 4567 8901',
        department: 'Finance & Billing',
      },
      {
        name: 'Emre Demir',
        email: 'accounts.istanbul@freighterp.com',
        password: defaultPassword,
        role: 'Accounts',
        branch: br5._id,
        phone: '+90 533 222 3344',
        department: 'Finance & Billing',
      },
    ];

    // Create users individually so pre('save') password hook hashes passwords
    const createdUsers = [];
    for (const u of usersToCreate) {
      const user = await User.create(u);
      createdUsers.push(user);
    }
    console.log(`[Seed] Successfully created ${createdUsers.length} users with hashed credentials.`);

    const superAdmin = createdUsers[0];
    const salesHq = createdUsers[6];

    console.log('[Seed] Seeding sample Customers, Leads, Quotations, Shipments, and Invoices...');

    // Customers with explicit customerCode
    const customers = await Customer.insertMany([
      {
        customerCode: 'CUST-2026-0001',
        companyName: 'Apex Petrochemical Global',
        contactPerson: 'David Miller',
        email: 'dmiller@apexpetro.com',
        phone: '+1 713 555 0199',
        address: '500 Texas Ave, Houston, TX 77002, USA',
        country: 'United States',
        currency: 'USD',
        branch: hq._id,
        createdBy: superAdmin._id,
      },
      {
        customerCode: 'CUST-2026-0002',
        companyName: 'Nordic Clean Energy BV',
        contactPerson: 'Emma Lindqvist',
        email: 'emma@nordiccleanenergy.nl',
        phone: '+31 20 890 1200',
        address: 'Keizersgracht 421, Amsterdam',
        country: 'Netherlands',
        currency: 'EUR',
        branch: br2._id,
        createdBy: superAdmin._id,
      },
      {
        customerCode: 'CUST-2026-0003',
        companyName: 'Pacific Rim Electronics Ltd',
        contactPerson: 'Kenji Sato',
        email: 'kenji.sato@pacificelec.sg',
        phone: '+65 6333 8888',
        address: 'Marina Bay Financial Centre Tower 1',
        country: 'Singapore',
        currency: 'USD',
        branch: br3._id,
        createdBy: superAdmin._id,
      },
      {
        customerCode: 'CUST-2026-0004',
        companyName: 'Bosphorus Industrial Spares',
        contactPerson: 'Burak Ozkan',
        email: 'burak@bosphorusspares.com',
        phone: '+90 216 444 9876',
        address: 'Tuzla Free Zone, Istanbul',
        country: 'Turkey',
        currency: 'TRY',
        branch: br5._id,
        createdBy: superAdmin._id,
      },
    ]);

    // Leads with explicit leadNumber and contactPerson
    const leads = await Lead.insertMany([
      {
        leadNumber: 'LED-2026-0001',
        contactPerson: 'John Zhang',
        leadName: 'John Zhang',
        companyName: 'Helios Glass Tech',
        email: 'inquiry@heliosglass.com',
        phone: '+86 21 6888 1234',
        country: 'China',
        leadSource: 'Exhibition',
        status: 'Qualified',
        branch: br4._id,
        assignedTo: createdUsers[11]._id,
        createdBy: superAdmin._id,
      },
      {
        leadNumber: 'LED-2026-0002',
        contactPerson: 'Ahmed Al-Kindi',
        leadName: 'Ahmed Al-Kindi',
        companyName: 'Al-Jazirah Equipment LLC',
        email: 'procurement@aljazirah.ae',
        phone: '+971 4 222 9988',
        country: 'UAE',
        leadSource: 'Website',
        status: 'Contacted',
        branch: hq._id,
        assignedTo: salesHq._id,
        createdBy: superAdmin._id,
      },
      {
        leadNumber: 'LED-2026-0003',
        contactPerson: 'Klaus Muller',
        leadName: 'Klaus Muller',
        companyName: 'Bavaria Agri Trading',
        email: 'bavaria@agri-trade.de',
        phone: '+49 89 234 567',
        country: 'Germany',
        leadSource: 'Referral',
        status: 'New',
        branch: br2._id,
        assignedTo: createdUsers[7]._id,
        createdBy: superAdmin._id,
      },
    ]);

    // Seed Sample Follow-ups
    await FollowUp.insertMany([
      {
        targetType: 'Lead',
        lead: leads[0]._id,
        followUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        assignedTo: createdUsers[11]._id,
        notes: 'Schedule product demo and discuss sea freight container requirements from Shanghai to Rotterdam.',
        status: 'Pending',
        branch: br4._id,
        createdBy: superAdmin._id,
      },
      {
        targetType: 'Lead',
        lead: leads[1]._id,
        followUpDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        assignedTo: salesHq._id,
        notes: 'Review project specs and follow up regarding customs documentation in Jebel Ali.',
        status: 'Pending',
        branch: hq._id,
        createdBy: superAdmin._id,
      },
      {
        targetType: 'Customer',
        customer: customers[0]._id,
        followUpDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        assignedTo: salesHq._id,
        notes: 'Discuss Q3 freight volume contract renewal.',
        status: 'Completed',
        completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        branch: hq._id,
        createdBy: superAdmin._id,
      },
    ]);

    // Quotations
    const quotations = await Quotation.insertMany([
      {
        quotationNumber: 'QT-2026-001',
        customer: customers[0]._id,
        contactPerson: 'David Miller',
        freightType: 'Sea Freight',
        origin: 'Jebel Ali Port (AEJEA)',
        destination: 'Port of Houston (USHOU)',
        cargoDescription: 'Industrial Valves & Pumps in 2x40ft HC',
        grossWeight: 24500,
        volumeCbm: 68.5,
        packagesCount: 42,
        currency: 'USD',
        freightCharges: 4800,
        additionalCharges: 450,
        discount: 150,
        tax: 255,
        totalAmount: 5355,
        validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'Sent',
        branch: hq._id,
        createdBy: salesHq._id,
      },
      {
        quotationNumber: 'QT-2026-002',
        customer: customers[1]._id,
        contactPerson: 'Emma Lindqvist',
        freightType: 'Air Freight',
        origin: 'Schiphol Airport (AMS)',
        destination: 'Singapore Changi (SIN)',
        cargoDescription: 'Precision Wind Turbine Sensor Assemblies',
        grossWeight: 1250,
        volumeCbm: 6.2,
        packagesCount: 8,
        currency: 'EUR',
        freightCharges: 6200,
        additionalCharges: 380,
        discount: 0,
        tax: 1381.8,
        totalAmount: 7961.8,
        validityDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'Draft',
        branch: br2._id,
        createdBy: createdUsers[7]._id,
      },
      {
        quotationNumber: 'QT-2026-003',
        customer: customers[2]._id,
        contactPerson: 'Kenji Sato',
        freightType: 'Sea Freight',
        origin: 'Singapore Port (SGSIN)',
        destination: 'Ambarli Port, Istanbul (TRAMB)',
        cargoDescription: 'Consumer Electronic Chips & PCB Boards',
        grossWeight: 14200,
        volumeCbm: 38.0,
        packagesCount: 120,
        currency: 'USD',
        freightCharges: 3600,
        additionalCharges: 250,
        discount: 100,
        tax: 187.5,
        totalAmount: 3937.5,
        validityDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        status: 'Accepted',
        branch: br3._id,
        createdBy: createdUsers[8]._id,
      },
    ]);

    // Shipments
    const shipments = await Shipment.insertMany([
      {
        shipmentNumber: 'SHP-2026-8801',
        customer: customers[0]._id,
        quotation: quotations[0]._id,
        freightType: 'Sea Freight',
        origin: 'Jebel Ali, UAE',
        destination: 'Houston, USA',
        shipper: 'PetroTech Middle East FZE',
        consignee: 'Apex Petrochemical Global',
        status: 'In Transit',
        etd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        eta: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
        branch: hq._id,
        assignedTo: createdUsers[9]._id,
        createdBy: salesHq._id,
      },
      {
        shipmentNumber: 'SHP-2026-8802',
        customer: customers[2]._id,
        quotation: quotations[2]._id,
        freightType: 'Sea Freight',
        origin: 'Singapore Port',
        destination: 'Ambarli Port, Istanbul',
        shipper: 'Pacific Rim Electronics Ltd',
        consignee: 'Bosphorus Industrial Spares',
        status: 'Customs Clearance',
        etd: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        eta: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        branch: br3._id,
        assignedTo: createdUsers[11]._id,
        createdBy: createdUsers[8]._id,
      },
      {
        shipmentNumber: 'SHP-2026-8803',
        customer: customers[1]._id,
        freightType: 'Road Freight',
        origin: 'Rotterdam Port, NL',
        destination: 'Frankfurt Hub, DE',
        shipper: 'Nordic Clean Energy BV',
        consignee: 'Siemens Energy Logistics',
        status: 'Delivered',
        etd: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        eta: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        deliveryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        branch: br2._id,
        assignedTo: createdUsers[10]._id,
        createdBy: createdUsers[7]._id,
      },
    ]);

    // Invoices
    await Invoice.insertMany([
      {
        invoiceNumber: 'INV-2026-1001',
        customer: customers[0]._id,
        shipment: shipments[0]._id,
        quotation: quotations[0]._id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currency: 'USD',
        totalAmount: 5355,
        paidAmount: 2000,
        balanceAmount: 3355,
        paymentStatus: 'Partially Paid',
        branch: hq._id,
        createdBy: createdUsers[12]._id,
      },
      {
        invoiceNumber: 'INV-2026-1002',
        customer: customers[2]._id,
        shipment: shipments[1]._id,
        quotation: quotations[2]._id,
        invoiceDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        currency: 'USD',
        totalAmount: 3937.5,
        paidAmount: 0,
        balanceAmount: 3937.5,
        paymentStatus: 'Unpaid',
        branch: br3._id,
        createdBy: createdUsers[12]._id,
      },
      {
        invoiceNumber: 'INV-2026-1003',
        customer: customers[1]._id,
        shipment: shipments[2]._id,
        invoiceDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        currency: 'EUR',
        totalAmount: 2450,
        paidAmount: 2450,
        balanceAmount: 0,
        paymentStatus: 'Paid',
        branch: br2._id,
        createdBy: createdUsers[13]._id,
      },
    ]);

    // Initial Activities
    await Activity.insertMany([
      {
        action: 'System Initialized',
        module: 'Auth',
        details: 'Initial system deployment and database seed complete with 5 branches and 15 users',
        user: superAdmin._id,
        userName: superAdmin.name,
        branch: hq._id,
      },
      {
        action: 'Quotation Created',
        module: 'Quotation',
        details: 'Quotation QT-2026-001 created for Apex Petrochemical Global ($5,355)',
        user: salesHq._id,
        userName: salesHq.name,
        branch: hq._id,
      },
      {
        action: 'Shipment Dispatched',
        module: 'Shipment',
        details: 'Shipment SHP-2026-8801 in transit from Jebel Ali to Houston',
        user: createdUsers[9]._id,
        userName: createdUsers[9].name,
        branch: hq._id,
      },
      {
        action: 'Invoice Issued',
        module: 'Invoice',
        details: 'Invoice INV-2026-1001 issued for Apex Petrochemical Global ($5,355)',
        user: createdUsers[12]._id,
        userName: createdUsers[12].name,
        branch: hq._id,
      },
    ]);

    console.log('[Seed] Database successfully seeded with 5 branches, 15 users, and complete operational data!');
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
    throw err;
  }
};

// If run directly via node
if (process.argv[1]?.includes('seedData.js')) {
  seedDatabase()
    .then(async () => {
      console.log('[Seed] Done. Closing connection.');
      await closeDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Failed:', err);
      await closeDB();
      process.exit(1);
    });
}
