import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import Shipment from '../models/Shipment.js';
import Activity from '../models/Activity.js';
import Branch from '../models/Branch.js';
import nodemailer from 'nodemailer';
import { generateNextSequence, sanitizeBranchCode } from '../utils/sequenceGenerator.js';
import { calculateFinancialTotals, roundMoney } from '../utils/financialCalculations.js';
import { generateInvoicePdfBuffer } from '../utils/invoicePdfGenerator.js';

// @desc    Get all invoices with search, filters, branch scoping, pagination
// @route   GET /api/invoices
// @access  Private
export const getInvoices = async (req, res, next) => {
  try {
    let query = {};

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id || req.user.branch;
      query.branch = userBranchId;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    // Status filter
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Customer filter
    if (req.query.customerId) {
      query.customer = req.query.customerId;
    }

    // Shipment filter
    if (req.query.shipmentId) {
      query.shipment = req.query.shipmentId;
    }

    // Currency filter
    if (req.query.currency) {
      query.currency = req.query.currency;
    }

    // Search query
    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      const matchingCustomers = await Customer.find({
        $or: [{ companyName: regex }, { contactPerson: regex }],
      }).select('_id');
      const custIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { invoiceNumber: regex },
        { customerBillingAddress: regex },
        { customer: { $in: custIds } },
      ];
    }

    // Date range
    if (req.query.startDate && req.query.endDate) {
      const dateField = req.query.dateField || 'invoiceDate';
      query[dateField] = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    let sort = { createdAt: -1 };
    if (req.query.sortBy) {
      const order = req.query.sortOrder === 'asc' ? 1 : -1;
      sort = { [req.query.sortBy]: order };
    }

    const [total, invoices] = await Promise.all([
      Invoice.countDocuments(query),
      Invoice.find(query)
        .populate('customer', 'customerCode companyName contactPerson email phone')
        .populate('branch', 'name code city country')
        .populate('shipment', 'shipmentNumber freightType origin destination')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      count: invoices.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: invoices,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single invoice by ID
// @route   GET /api/invoices/:id
// @access  Private
export const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customer')
      .populate('branch')
      .populate('shipment')
      .populate('quotation')
      .populate('createdBy', 'name email')
      .populate('issuedBy', 'name email')
      .populate('paymentHistory.recordedBy', 'name email');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const invoiceBranchId = invoice.branch?._id?.toString() || invoice.branch?.toString();
      if (userBranchId !== invoiceBranchId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You cannot view invoices from another branch.',
        });
      }
    }

    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new invoice (standalone or from shipment)
// @route   POST /api/invoices
// @access  Private (Super Admin, Branch Admin, Accounts)
export const createInvoice = async (req, res, next) => {
  try {
    const customerId = req.body.customer || req.body.customerId;
    const shipmentId = req.body.shipment || req.body.shipmentId;
    const quotationId = req.body.quotation || req.body.quotationId;
    const branchIdInput = req.body.branch || req.body.branchId;
    const {
      invoiceDate,
      dueDate,
      currency,
      paymentTerms,
      lineItems = [],
      taxRate = 0,
      tax = 0,
      discount = 0,
      internalNotes,
      customerNotes,
      status: initialStatus = 'Draft',
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer is required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Branch assignment & scoping
    let assignedBranch = req.user.branch?._id || req.user.branch;
    if (req.user.role === 'Super Admin' && branchIdInput) {
      assignedBranch = branchIdInput;
    }
    const branchDoc = await Branch.findById(assignedBranch);
    if (!branchDoc) {
      return res.status(400).json({ success: false, message: 'Valid branch required' });
    }

    // Concurrency-safe atomic invoice numbering
    const invoiceNumber = await generateNextSequence('INV', assignedBranch);

    // Calculate financials accurately
    const calculated = calculateFinancialTotals({
      lineItems,
      tax,
      taxRate,
      discount,
    });

    const isIssued = initialStatus === 'Issued';
    const computedDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await Invoice.create({
      invoiceNumber,
      customer: customer._id,
      customerBillingAddress: customer.address || `${customer.city || ''}, ${customer.country || ''}`,
      customerTaxNumber: customer.taxNumber || '',
      shipment: shipmentId || undefined,
      quotation: quotationId || undefined,
      branch: assignedBranch,
      branchCode: sanitizeBranchCode(branchDoc.code),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      dueDate: computedDueDate,
      currency: currency || customer.currency || 'USD',
      paymentTerms: paymentTerms || 'Net 30 Days',
      ...calculated,
      paidAmount: 0,
      balanceAmount: calculated.totalAmount,
      status: initialStatus,
      internalNotes: internalNotes || '',
      customerNotes: customerNotes || 'Thank you for choosing FreightERP.',
      issuedAt: isIssued ? new Date() : undefined,
      issuedBy: isIssued ? req.user._id : undefined,
      createdBy: req.user._id,
    });

    // If linked to a shipment, mark shipment billing state
    if (shipmentId) {
      await Shipment.findByIdAndUpdate(shipmentId, {
        invoiceStatus: 'Billed',
        invoiceRef: invoice._id,
      });
    }

    await Activity.create({
      action: 'Invoice Created',
      module: 'Accounting',
      details: `Generated invoice ${invoice.invoiceNumber} for ${customer.companyName} (${invoice.currency} ${invoice.totalAmount})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    const populated = await Invoice.findById(invoice._id)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code city country');

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update draft invoice
// @route   PUT /api/invoices/:id
// @access  Private (Super Admin, Branch Admin, Accounts)
export const updateInvoice = async (req, res, next) => {
  try {
    let invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== invoice.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (invoice.status !== 'Draft' && req.user.role !== 'Super Admin') {
      return res.status(400).json({
        success: false,
        message: `Cannot edit an invoice in '${invoice.status}' status. Only Draft invoices may be modified.`,
      });
    }

    const {
      dueDate,
      paymentTerms,
      lineItems,
      tax,
      taxRate,
      discount,
      internalNotes,
      customerNotes,
      customerBillingAddress,
      customerTaxNumber,
    } = req.body;

    if (lineItems) {
      const calculated = calculateFinancialTotals({
        lineItems,
        tax: tax !== undefined ? tax : invoice.tax,
        taxRate: taxRate !== undefined ? taxRate : invoice.taxRate,
        discount: discount !== undefined ? discount : invoice.discount,
      });
      invoice.lineItems = calculated.lineItems;
      invoice.subtotal = calculated.subtotal;
      invoice.discount = calculated.discount;
      invoice.tax = calculated.tax;
      invoice.taxRate = calculated.taxRate;
      invoice.totalAmount = calculated.totalAmount;
      invoice.balanceAmount = roundMoney(calculated.totalAmount - (invoice.paidAmount || 0));
    }

    if (dueDate) invoice.dueDate = new Date(dueDate);
    if (paymentTerms) invoice.paymentTerms = paymentTerms;
    if (internalNotes !== undefined) invoice.internalNotes = internalNotes;
    if (customerNotes !== undefined) invoice.customerNotes = customerNotes;
    if (customerBillingAddress) invoice.customerBillingAddress = customerBillingAddress;
    if (customerTaxNumber !== undefined) invoice.customerTaxNumber = customerTaxNumber;

    await invoice.save();

    res.json({ success: true, message: 'Invoice updated successfully', data: invoice });
  } catch (err) {
    next(err);
  }
};

// @desc    Issue invoice (lock commercial details and make official)
// @route   PUT /api/invoices/:id/issue
// @access  Private (Super Admin, Branch Admin, Accounts)
export const issueInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== invoice.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (invoice.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Invoice is already in '${invoice.status}' status and cannot be re-issued.`,
      });
    }

    invoice.status = 'Issued';
    invoice.issuedAt = new Date();
    invoice.issuedBy = req.user._id;
    await invoice.save();

    await Activity.create({
      action: 'Invoice Issued',
      module: 'Accounting',
      details: `Issued commercial invoice ${invoice.invoiceNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: invoice.branch,
    });

    res.json({ success: true, message: 'Invoice issued successfully', data: invoice });
  } catch (err) {
    next(err);
  }
};

// @desc    Void invoice (must not have active payments)
// @route   PUT /api/invoices/:id/void
// @access  Private (Super Admin, Branch Admin, Accounts)
export const voidInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== invoice.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (invoice.paidAmount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot void an invoice that has payments recorded. Reverse the payments first.',
      });
    }

    if (invoice.status === 'Void') {
      return res.status(400).json({ success: false, message: 'Invoice is already voided.' });
    }

    invoice.status = 'Void';
    invoice.voidedAt = new Date();
    invoice.voidedBy = req.user._id;
    invoice.voidReason = req.body.reason || 'Voided by administrative order';
    await invoice.save();

    await Activity.create({
      action: 'Invoice Voided',
      module: 'Accounting',
      details: `Voided invoice ${invoice.invoiceNumber}. Reason: ${invoice.voidReason}`,
      user: req.user._id,
      userName: req.user.name,
      branch: invoice.branch,
    });

    res.json({ success: true, message: 'Invoice voided successfully', data: invoice });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate and download invoice PDF
// @route   GET /api/invoices/:id/pdf
// @access  Private
export const generateInvoicePdf = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customer')
      .populate('branch')
      .populate('shipment');

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== invoice.branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// @desc    Email invoice to customer
// @route   POST /api/invoices/:id/send-email
// @access  Private (Super Admin, Branch Admin, Accounts)
export const sendInvoiceEmail = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customer')
      .populate('branch')
      .populate('shipment');

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const recipient = req.body.email || invoice.customer?.email;
    if (!recipient) {
      return res.status(400).json({ success: false, message: 'Recipient email address is required' });
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice);

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const subject = `[FreightERP] Commercial Invoice ${invoice.invoiceNumber}`;
    let isSimulated = false;
    let messageId = `sim-${Date.now()}`;

    if (smtpHost && smtpUser) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const info = await transporter.sendMail({
        from: `"FreightERP Billing" <${smtpUser}>`,
        to: recipient,
        subject,
        html: `
          <h2>Invoice ${invoice.invoiceNumber}</h2>
          <p>Dear ${invoice.customer?.companyName || 'Valued Customer'},</p>
          <p>Please find attached your commercial invoice from ${invoice.branch?.name || 'FreightERP'}.</p>
          <p><strong>Total:</strong> ${invoice.currency} ${invoice.totalAmount.toFixed(2)}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'Upon receipt'}</p>
        `,
        attachments: [
          {
            filename: `Invoice-${invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      messageId = info.messageId;
    } else {
      isSimulated = true;
      console.log(`[SMTP SIMULATED] Invoice ${invoice.invoiceNumber} email dispatched to ${recipient}`);
    }

    invoice.emailHistory.push({
      sentTo: recipient,
      sentAt: new Date(),
      sentBy: req.user._id,
      simulated: isSimulated,
      messageId,
    });
    await invoice.save();

    res.json({
      success: true,
      message: isSimulated
        ? `Invoice email simulated (SMTP not configured in environment). Logged to ${recipient}`
        : `Invoice emailed successfully to ${recipient}`,
      simulated: isSimulated,
      messageId,
    });
  } catch (err) {
    next(err);
  }
};
