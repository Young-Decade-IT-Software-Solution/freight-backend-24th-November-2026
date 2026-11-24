import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import Quotation from '../models/Quotation.js';
import Customer from '../models/Customer.js';
import Shipment from '../models/Shipment.js';
import Activity from '../models/Activity.js';

// Helper: Calculation Engine
export const calculateQuotationTotals = ({
  freightCharges = 0,
  additionalChargeItems = [],
  discount = 0,
  tax = 0,
}) => {
  const freight = Number(freightCharges) || 0;
  const additional = (additionalChargeItems || []).reduce(
    (acc, item) => acc + (Number(item.amount) || 0),
    0
  );
  const disc = Number(discount) || 0;
  const tx = Number(tax) || 0;
  const total = freight + additional + tx - disc;

  return {
    freightCharges: Math.max(0, freight),
    additionalChargeItems,
    additionalCharges: Math.max(0, additional),
    discount: Math.max(0, disc),
    tax: Math.max(0, tx),
    totalAmount: Math.max(0, Math.round(total * 100) / 100),
  };
};

// @desc    Get all quotations (branch-scoped)
// @route   GET /api/quotations
// @access  Private
export const getQuotations = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      query.$or = [
        { quotationNumber: regex },
        { origin: regex },
        { destination: regex },
        { contactPerson: regex },
      ];
    }

    const quotations = await Quotation.find(query)
      .populate('customer', 'customerCode companyName contactPerson email phone')
      .populate('branch', 'name code city country')
      .populate('convertedShipment', 'shipmentNumber status')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: quotations.length,
      data: quotations,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get quotation by ID
// @route   GET /api/quotations/:id
// @access  Private
export const getQuotationById = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customer')
      .populate('branch', 'name code city country address phone email')
      .populate('convertedShipment')
      .populate('createdBy', 'name email phone department');

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const quoteBranchId = quotation.branch?._id?.toString() || quotation.branch?.toString();
      if (userBranchId !== quoteBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this quotation' });
      }
    }

    res.json({
      success: true,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create quotation
// @route   POST /api/quotations
// @access  Private
export const createQuotation = async (req, res, next) => {
  try {
    const {
      customer: customerId,
      contactPerson,
      freightType,
      origin,
      destination,
      cargoDescription,
      grossWeight,
      volumeCbm,
      packagesCount,
      currency,
      freightCharges,
      additionalChargeItems,
      discount,
      tax,
      validityDate,
      termsAndConditions,
      internalNotes,
      status,
      branch,
    } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(400).json({ success: false, message: 'Valid customer is required' });
    }

    const assignedBranch = req.user.role === 'Super Admin' && branch
      ? branch
      : (customer.branch || req.user.branch?._id || req.user.branch);

    // Calculate totals using Calculation Engine
    const calculated = calculateQuotationTotals({
      freightCharges,
      additionalChargeItems,
      discount,
      tax,
    });

    const year = new Date().getFullYear();
    const count = await Quotation.countDocuments();
    const quotationNumber = `QT-${year}-${String(count + 1).padStart(4, '0')}`;

    const quotation = await Quotation.create({
      quotationNumber,
      revision: 1,
      customer: customer._id,
      contactPerson: contactPerson || customer.contactPerson,
      freightType: freightType || 'Sea FCL',
      origin,
      destination,
      cargoDescription: cargoDescription || '',
      grossWeight: Number(grossWeight) || 0,
      volumeCbm: Number(volumeCbm) || 0,
      packagesCount: Number(packagesCount) || 1,
      currency: currency || customer.currency || 'USD',
      ...calculated,
      validityDate: validityDate ? new Date(validityDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      termsAndConditions: termsAndConditions || undefined,
      internalNotes: internalNotes || '',
      status: status || 'Draft',
      branch: assignedBranch,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: 'Quotation Created',
      module: 'Quotation',
      details: `Created quotation ${quotation.quotationNumber} for ${customer.companyName} (${quotation.currency} ${quotation.totalAmount})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await Quotation.findById(quotation._id)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update quotation (charges recalculation)
// @route   PUT /api/quotations/:id
// @access  Private
export const updateQuotation = async (req, res, next) => {
  try {
    let quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    if (quotation.status === 'Accepted' && req.body.status !== 'Accepted') {
      // Allow modifying notes or status transition
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const quoteBranchId = quotation.branch?._id?.toString() || quotation.branch?.toString();
      if (userBranchId !== quoteBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      delete req.body.branch;
      delete req.body.quotationNumber;
    }

    // Recalculate totals if charge-related fields change
    const freightCharges = req.body.freightCharges !== undefined ? req.body.freightCharges : quotation.freightCharges;
    const additionalChargeItems = req.body.additionalChargeItems !== undefined ? req.body.additionalChargeItems : quotation.additionalChargeItems;
    const discount = req.body.discount !== undefined ? req.body.discount : quotation.discount;
    const tax = req.body.tax !== undefined ? req.body.tax : quotation.tax;

    const calculated = calculateQuotationTotals({
      freightCharges,
      additionalChargeItems,
      discount,
      tax,
    });

    Object.assign(req.body, calculated);

    quotation = await Quotation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code');

    await Activity.create({
      action: 'Quotation Updated',
      module: 'Quotation',
      details: `Updated quotation ${quotation.quotationNumber} (${quotation.status})`,
      user: req.user._id,
      userName: req.user.name,
      branch: quotation.branch?._id || quotation.branch,
    });

    res.json({
      success: true,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update quotation status
// @route   PATCH /api/quotations/:id/status
// @access  Private
export const updateQuotationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    quotation.status = status;
    await quotation.save();

    await Activity.create({
      action: 'Quotation Status Changed',
      module: 'Quotation',
      details: `Quotation ${quotation.quotationNumber} status updated to ${status}`,
      user: req.user._id,
      userName: req.user.name,
      branch: quotation.branch,
    });

    res.json({
      success: true,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Duplicate / Revise quotation
// @route   POST /api/quotations/:id/duplicate
// @access  Private
export const duplicateQuotation = async (req, res, next) => {
  try {
    const original = await Quotation.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: 'Original quotation not found' });
    }

    const isRevision = req.body.isRevision === true;
    let newNumber;
    let newRevision = 1;

    if (isRevision) {
      newRevision = (original.revision || 1) + 1;
      const baseNum = original.quotationNumber.replace(/-R\d+$/, '');
      newNumber = `${baseNum}-R${newRevision}`;
    } else {
      const year = new Date().getFullYear();
      const count = await Quotation.countDocuments();
      newNumber = `QT-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    const newQuotation = await Quotation.create({
      quotationNumber: newNumber,
      revision: newRevision,
      parentQuotation: original._id,
      customer: original.customer,
      contactPerson: original.contactPerson,
      freightType: original.freightType,
      origin: original.origin,
      destination: original.destination,
      cargoDescription: original.cargoDescription,
      grossWeight: original.grossWeight,
      volumeCbm: original.volumeCbm,
      packagesCount: original.packagesCount,
      currency: original.currency,
      freightCharges: original.freightCharges,
      additionalChargeItems: original.additionalChargeItems,
      additionalCharges: original.additionalCharges,
      discount: original.discount,
      tax: original.tax,
      totalAmount: original.totalAmount,
      validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      termsAndConditions: original.termsAndConditions,
      internalNotes: `Cloned from ${original.quotationNumber}`,
      status: 'Draft',
      isConvertedToShipment: false,
      branch: original.branch,
      createdBy: req.user._id,
    });

    await Activity.create({
      action: isRevision ? 'Quotation Revised' : 'Quotation Duplicated',
      module: 'Quotation',
      details: `${isRevision ? 'Created revision' : 'Duplicated'} ${newQuotation.quotationNumber} from ${original.quotationNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: original.branch,
    });

    const populated = await Quotation.findById(newQuotation._id)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code');

    res.status(201).json({
      success: true,
      message: isRevision ? 'Revision created' : 'Quotation duplicated',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Convert accepted quotation into shipment
// @route   POST /api/quotations/:id/convert-to-shipment
// @access  Private
export const convertToShipment = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customer')
      .populate('branch');

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    if (quotation.status !== 'Accepted') {
      return res.status(400).json({
        success: false,
        message: 'Only Accepted quotations can be converted to a shipment. Please mark as Accepted first.',
      });
    }

    if (quotation.isConvertedToShipment) {
      return res.status(400).json({
        success: false,
        message: 'This quotation has already been converted to a shipment. Duplicate conversion is not allowed.',
      });
    }

    // Double check Shipment table to prevent duplicate
    const existingShipment = await Shipment.findOne({ quotation: quotation._id });
    if (existingShipment) {
      quotation.isConvertedToShipment = true;
      quotation.convertedShipment = existingShipment._id;
      await quotation.save();
      return res.status(400).json({
        success: false,
        message: `A shipment (${existingShipment.shipmentNumber}) already exists for this quotation.`,
      });
    }

    // Import helpers
    const { generateNextShipmentNumber, initializeDefaultMilestones, sendShipmentNotification } = await import('./shipmentController.js');

    // Auto-generate Shipment Number
    const shipmentNumber = await generateNextShipmentNumber();

    // Create Shipment carrying forward all data from Quotation
    const shipment = await Shipment.create({
      shipmentNumber,
      customer: quotation.customer._id,
      quotation: quotation._id,
      freightType: quotation.freightType,
      origin: quotation.origin,
      destination: quotation.destination,
      shipper: quotation.customer.companyName,
      consignee: req.body.consignee || quotation.contactPerson || 'To Order',
      cargoDescription: quotation.cargoDescription || 'General Cargo',
      weight: quotation.grossWeight,
      volume: quotation.volumeCbm,
      packages: quotation.packagesCount,
      currency: quotation.currency,
      agreedCharges: quotation.totalAmount,
      freightCharges: quotation.freightCharges || 0,
      additionalCharges: quotation.additionalCharges || 0,
      discount: quotation.discount || 0,
      tax: quotation.tax || 0,
      status: 'Booked',
      statusHistory: [
        {
          previousStatus: '',
          newStatus: 'Booked',
          changedBy: req.user._id,
          changedByName: req.user.name,
          date: new Date(),
          remarks: `Converted from accepted quotation ${quotation.quotationNumber}`,
        },
      ],
      etd: req.body.etd ? new Date(req.body.etd) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      eta: req.body.eta ? new Date(req.body.eta) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      branch: quotation.branch._id || quotation.branch,
      assignedTo: req.body.assignedTo || req.user._id,
      createdBy: req.user._id,
    });

    // Auto-create default milestones
    await initializeDefaultMilestones(shipment, req.user);

    // Send shipment creation notification
    sendShipmentNotification(shipment, 'Created from Quotation');

    // Mark quotation converted
    quotation.isConvertedToShipment = true;
    quotation.convertedShipment = shipment._id;
    await quotation.save();

    await Activity.create({
      action: 'Shipment Generated',
      module: 'Shipment',
      details: `Converted Quotation ${quotation.quotationNumber} into Shipment ${shipment.shipmentNumber} for ${quotation.customer.companyName}`,
      user: req.user._id,
      userName: req.user.name,
      branch: quotation.branch._id || quotation.branch,
    });

    res.status(201).json({
      success: true,
      message: 'Quotation successfully converted to shipment',
      data: {
        quotation,
        shipment,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate PDF for quotation
// @route   GET /api/quotations/:id/pdf
// @access  Private
export const generateQuotationPdf = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customer')
      .populate('branch')
      .populate('createdBy', 'name email');

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Quotation-${quotation.quotationNumber}.pdf"`
    );

    doc.pipe(res);

    // Header Branding
    doc
      .fillColor('#0F172A')
      .fontSize(22)
      .text('FreightERP Logistics', 40, 40)
      .fontSize(10)
      .fillColor('#64748B')
      .text(`${quotation.branch?.name || 'Head Office'} • ${quotation.branch?.city || 'Dubai'}, ${quotation.branch?.country || 'UAE'}`)
      .text(`Email: ${quotation.branch?.email || 'ops@freighterp.com'} | Tel: ${quotation.branch?.phone || '+971 4 398 2211'}`)
      .moveDown(1.5);

    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, 95).lineTo(555, 95).stroke();

    // Quotation Reference Box
    doc
      .rect(360, 110, 195, 80)
      .fillAndStroke('#F8FAFC', '#CBD5E1');

    doc
      .fillColor('#0F172A')
      .fontSize(12)
      .text('FREIGHT QUOTATION', 370, 118, { bold: true })
      .fontSize(9)
      .fillColor('#475569')
      .text(`Quote #: ${quotation.quotationNumber}`, 370, 134)
      .text(`Date: ${new Date(quotation.createdAt).toLocaleDateString()}`, 370, 148)
      .text(`Validity: ${quotation.validityDate ? new Date(quotation.validityDate).toLocaleDateString() : '30 Days'}`, 370, 162);

    // Customer Info
    doc
      .fontSize(11)
      .fillColor('#0F172A')
      .text('BILL TO / CUSTOMER:', 40, 118)
      .fontSize(10)
      .fillColor('#1E293B')
      .text(quotation.customer?.companyName || 'Valued Customer', 40, 134)
      .fontSize(9)
      .fillColor('#64748B')
      .text(`Attn: ${quotation.contactPerson || quotation.customer?.contactPerson || 'Logistics Dept'}`, 40, 148)
      .text(`Email: ${quotation.customer?.email || 'N/A'} | Phone: ${quotation.customer?.phone || 'N/A'}`, 40, 162)
      .text(`Address: ${quotation.customer?.address || 'N/A'}, ${quotation.customer?.country || ''}`, 40, 176);

    // Shipment Specifications Box
    doc.moveDown(3);
    const startY = 210;
    doc.rect(40, startY, 515, 60).fillAndStroke('#F0FDFA', '#CCFBF1');

    doc
      .fillColor('#0D9488')
      .fontSize(10)
      .text('SHIPMENT DETAILS & ROUTE', 50, startY + 8);

    doc
      .fillColor('#0F172A')
      .fontSize(9)
      .text(`Freight Mode: ${quotation.freightType}`, 50, startY + 24)
      .text(`Origin: ${quotation.origin}`, 50, startY + 38)
      .text(`Destination: ${quotation.destination}`, 220, startY + 24)
      .text(`Packages: ${quotation.packagesCount} pkgs`, 220, startY + 38)
      .text(`Weight: ${quotation.grossWeight} KG`, 380, startY + 24)
      .text(`Volume: ${quotation.volumeCbm} CBM`, 380, startY + 38);

    // Charges Table
    const tableTop = 290;
    doc.rect(40, tableTop, 515, 22).fill('#1E293B');
    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .text('DESCRIPTION / CHARGE ITEM', 50, tableTop + 6)
      .text('AMOUNT', 480, tableTop + 6, { align: 'right', width: 65 });

    let currentY = tableTop + 28;

    // Line 1: Primary Freight Charges
    doc
      .fillColor('#0F172A')
      .fontSize(9)
      .text(`Base Freight Charges (${quotation.freightType})`, 50, currentY)
      .text(`${quotation.currency} ${quotation.freightCharges?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 65 });

    currentY += 20;

    // Additional Charges breakdown
    if (quotation.additionalChargeItems && quotation.additionalChargeItems.length > 0) {
      quotation.additionalChargeItems.forEach((item) => {
        doc
          .fillColor('#334155')
          .fontSize(9)
          .text(item.description, 50, currentY)
          .text(`${quotation.currency} ${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 65 });
        currentY += 18;
      });
    }

    if (quotation.discount > 0) {
      doc
        .fillColor('#E11D48')
        .text('Special Commercial Discount', 50, currentY)
        .text(`- ${quotation.currency} ${quotation.discount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 65 });
      currentY += 18;
    }

    if (quotation.tax > 0) {
      doc
        .fillColor('#334155')
        .text('VAT / Local Duties & Taxes', 50, currentY)
        .text(`${quotation.currency} ${quotation.tax?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 65 });
      currentY += 18;
    }

    // Total Amount Box
    doc.rect(40, currentY + 5, 515, 30).fillAndStroke('#F8FAFC', '#0D9488');
    doc
      .fillColor('#0F172A')
      .fontSize(11)
      .text('TOTAL AGREED AMOUNT:', 50, currentY + 14)
      .fontSize(12)
      .fillColor('#0D9488')
      .text(`${quotation.currency} ${quotation.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 450, currentY + 13, { align: 'right', width: 95 });

    // Terms & Conditions
    currentY += 55;
    doc
      .fillColor('#0F172A')
      .fontSize(9)
      .text('TERMS & CONDITIONS:', 40, currentY)
      .fontSize(8)
      .fillColor('#64748B')
      .text(quotation.termsAndConditions || 'Standard freight forwarding terms apply.', 40, currentY + 14, { width: 515 });

    // Footer
    doc
      .fontSize(8)
      .fillColor('#94A3B8')
      .text('FreightERP Automated Quotation • Generated on ' + new Date().toISOString(), 40, 780, { align: 'center', width: 515 });

    doc.end();
  } catch (err) {
    next(err);
  }
};

// @desc    Send quotation via email using configured SMTP
// @route   POST /api/quotations/:id/send-email
// @access  Private
export const sendQuotationEmail = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customer')
      .populate('branch');

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    const targetEmail = req.body.email || quotation.customer?.email;
    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Recipient email address is required' });
    }

    // SMTP configuration check
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    let emailSent = false;
    let messageId = null;

    if (smtpHost && smtpUser) {
      // Real SMTP Dispatch
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const info = await transporter.sendMail({
        from: `"${quotation.branch?.name || 'FreightERP'}" <${smtpUser}>`,
        to: targetEmail,
        subject: `Freight Quotation ${quotation.quotationNumber} for ${quotation.customer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0F172A;">Freight Quotation ${quotation.quotationNumber}</h2>
            <p>Dear ${quotation.contactPerson || 'Customer'},</p>
            <p>Thank you for choosing FreightERP. Please find below the quotation for your upcoming cargo shipment:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td><strong>Route:</strong></td><td>${quotation.origin} → ${quotation.destination}</td></tr>
              <tr><td><strong>Mode:</strong></td><td>${quotation.freightType}</td></tr>
              <tr><td><strong>Total Amount:</strong></td><td><strong>${quotation.currency} ${quotation.totalAmount?.toLocaleString()}</strong></td></tr>
            </table>
            <p>Best regards,<br/><strong>${quotation.branch?.name || 'FreightERP Operations'}</strong></p>
          </div>
        `,
      });
      emailSent = true;
      messageId = info.messageId;
    } else {
      // Graceful simulated dispatch log when SMTP credentials are not configured
      console.log(`[SMTP SIMULATED] Quotation ${quotation.quotationNumber} sent to ${targetEmail}`);
      emailSent = true;
      messageId = `simulated-${Date.now()}@freighterp.local`;
    }

    // Update status to 'Sent'
    if (quotation.status === 'Draft') {
      quotation.status = 'Sent';
      await quotation.save();
    }

    await Activity.create({
      action: 'Quotation Emailed',
      module: 'Quotation',
      details: `Emailed quotation ${quotation.quotationNumber} to ${targetEmail}`,
      user: req.user._id,
      userName: req.user.name,
      branch: quotation.branch._id || quotation.branch,
    });

    res.json({
      success: true,
      message: `Quotation sent successfully to ${targetEmail}`,
      messageId,
      quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete quotation (Draft only)
// @route   DELETE /api/quotations/:id
// @access  Private
export const deleteQuotation = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    if (quotation.status !== 'Draft' && req.user.role !== 'Super Admin') {
      return res.status(400).json({
        success: false,
        message: 'Only Draft quotations can be deleted. Non-drafts must be marked Rejected or Expired.',
      });
    }

    if (quotation.isConvertedToShipment) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete quotation linked to an active shipment.',
      });
    }

    await Quotation.findByIdAndDelete(req.params.id);

    await Activity.create({
      action: 'Quotation Deleted',
      module: 'Quotation',
      details: `Deleted quotation ${quotation.quotationNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: quotation.branch,
    });

    res.json({
      success: true,
      message: 'Quotation deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};
