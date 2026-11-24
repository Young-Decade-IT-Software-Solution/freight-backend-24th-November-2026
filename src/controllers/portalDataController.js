import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Shipment from '../models/Shipment.js';
import ShipmentMilestone from '../models/ShipmentMilestone.js';
import ShipmentDocument from '../models/ShipmentDocument.js';
import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import CustomerReceipt from '../models/CustomerReceipt.js';
import CustomerUser from '../models/CustomerUser.js';
import Customer from '../models/Customer.js';
import Activity from '../models/Activity.js';
import { generateInvoicePdfBuffer } from '../utils/invoicePdfGenerator.js';

// ==========================================
// 1. DASHBOARD
// ==========================================

// @desc    Get customer dashboard metrics & recent items
// @route   GET /api/portal/dashboard
// @access  Private (Customer Portal)
export const getPortalDashboard = async (req, res, next) => {
  try {
    const customerId = req.customerId;

    // Shipments metrics
    const totalShipments = await Shipment.countDocuments({ customer: customerId });
    const activeShipments = await Shipment.countDocuments({
      customer: customerId,
      status: { $nin: ['Delivered', 'Cancelled'] },
    });
    const inTransitShipments = await Shipment.countDocuments({
      customer: customerId,
      status: 'In Transit',
    });
    const deliveredShipments = await Shipment.countDocuments({
      customer: customerId,
      status: 'Delivered',
    });

    // Quotations metrics
    const openQuotations = await Quotation.countDocuments({
      customer: customerId,
      status: 'Sent',
    });
    const totalQuotations = await Quotation.countDocuments({
      customer: customerId,
    });

    // Invoices metrics
    const issuedInvoices = await Invoice.find({
      customer: customerId,
      status: { $in: ['Issued', 'Partially Paid', 'Overdue'] },
    });
    const pendingInvoicesCount = issuedInvoices.length;
    const totalOutstandingBalance = issuedInvoices.reduce(
      (sum, inv) => sum + (inv.balanceAmount || 0),
      0
    );

    // Recent shipments (latest 5)
    const recentShipments = await Shipment.find({ customer: customerId })
      .select('-internalRemarks')
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent invoices (latest 5, non-draft)
    const recentInvoices = await Invoice.find({
      customer: customerId,
      status: { $ne: 'Draft' },
    })
      .select('-internalNotes')
      .sort({ invoiceDate: -1 })
      .limit(5);

    // Recent quotations (latest 5)
    const recentQuotations = await Quotation.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        company: {
          name: req.customer.companyName,
          code: req.customer.customerCode,
          currency: req.customer.currency || 'USD',
        },
        kpis: {
          totalShipments,
          activeShipments,
          inTransitShipments,
          deliveredShipments,
          openQuotations,
          totalQuotations,
          pendingInvoicesCount,
          totalOutstandingBalance,
        },
        recentShipments,
        recentInvoices,
        recentQuotations,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 2. QUOTATIONS
// ==========================================

// @desc    Get customer quotations
// @route   GET /api/portal/quotations
// @access  Private (Customer Portal)
export const getPortalQuotations = async (req, res, next) => {
  try {
    const quotations = await Quotation.find({ customer: req.customerId })
      .populate('branch', 'name code city country')
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

// @desc    Get customer quotation details
// @route   GET /api/portal/quotations/:id
// @access  Private (Customer Portal)
export const getPortalQuotationById = async (req, res, next) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      customer: req.customerId,
    }).populate('branch', 'name code city country phone email');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found or you are not authorized to view it',
      });
    }

    res.json({
      success: true,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Download customer quotation PDF
// @route   GET /api/portal/quotations/:id/pdf
// @access  Private (Customer Portal)
export const downloadPortalQuotationPdf = async (req, res, next) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      customer: req.customerId,
    })
      .populate('customer')
      .populate('branch');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found or access denied',
      });
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Quotation-${quotation.quotationNumber}.pdf"`
    );

    doc.pipe(res);

    // Branding & Header
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
    doc.rect(360, 110, 195, 80).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc
      .fillColor('#0F172A')
      .fontSize(12)
      .text('CUSTOMER QUOTATION', 370, 118)
      .fontSize(9)
      .fillColor('#475569')
      .text(`Quote #: ${quotation.quotationNumber}`, 370, 134)
      .text(`Date: ${new Date(quotation.createdAt).toLocaleDateString()}`, 370, 148)
      .text(`Status: ${quotation.status}`, 370, 162);

    // Customer details
    doc
      .fillColor('#0F172A')
      .fontSize(11)
      .text('QUOTATION ISSUED TO:', 40, 118)
      .fontSize(10)
      .fillColor('#334155')
      .text(quotation.customer?.companyName || 'Valued Customer', 40, 134)
      .text(`Attn: ${quotation.contactPerson || quotation.customer?.contactPerson || 'N/A'}`, 40, 148)
      .text(`Email: ${quotation.customer?.email || 'N/A'}`, 40, 162);

    // Shipment Specs
    doc.rect(40, 205, 515, 60).fill('#F1F5F9');
    doc
      .fillColor('#0F172A')
      .fontSize(10)
      .text(`Freight Mode: ${quotation.freightType}`, 50, 215)
      .text(`Origin: ${quotation.origin}`, 50, 232)
      .text(`Destination: ${quotation.destination}`, 50, 248)
      .text(`Cargo: ${quotation.cargoDescription || 'General Cargo'}`, 300, 215)
      .text(`Weight: ${quotation.grossWeight || 0} kg | Volume: ${quotation.volumeCbm || 0} CBM`, 300, 232)
      .text(`Validity: ${quotation.validityDate ? new Date(quotation.validityDate).toLocaleDateString() : '30 Days'}`, 300, 248);

    // Charges Table
    let y = 280;
    doc.rect(40, y, 515, 24).fill('#0284C7');
    doc.fillColor('#FFFFFF').fontSize(10).text('Charge Description', 50, y + 6);
    doc.text(`Amount (${quotation.currency})`, 440, y + 6, { align: 'right', width: 105 });

    y += 24;
    (quotation.charges || []).forEach((c, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(40, y, 515, 22).fill(bg);
      doc.fillColor('#334155').fontSize(9).text(c.description, 50, y + 6);
      doc.text(`${(c.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 440, y + 6, { align: 'right', width: 105 });
      y += 22;
    });

    // Total Box
    y += 10;
    doc.rect(340, y, 215, 60).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.fillColor('#475569').fontSize(9);
    doc.text('Subtotal:', 350, y + 8);
    doc.text(`${(quotation.subtotal || quotation.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${quotation.currency}`, 440, y + 8, { align: 'right', width: 105 });
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold');
    doc.text('Total Quotation:', 350, y + 36);
    doc.text(`${quotation.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${quotation.currency}`, 440, y + 36, { align: 'right', width: 105 });

    // Footer note
    doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(
      'Generated via FreightERP Secure Customer Portal. Acceptance of this quotation constitutes a binding commercial agreement under standard forwarding terms.',
      40,
      760,
      { align: 'center', width: 515 }
    );

    doc.end();
  } catch (err) {
    next(err);
  }
};

// @desc    Accept quotation from portal
// @route   POST /api/portal/quotations/:id/accept
// @access  Private (Customer Portal)
export const acceptPortalQuotation = async (req, res, next) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      customer: req.customerId,
    }).populate('customer');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found or you are not authorized',
      });
    }

    if (quotation.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `This quotation cannot be accepted because its status is '${quotation.status}'. Only 'Sent' quotations can be accepted.`,
      });
    }

    if (quotation.validityDate && new Date(quotation.validityDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This quotation has expired and can no longer be accepted. Please request a new quote.',
      });
    }

    quotation.status = 'Accepted';
    quotation.acceptedAt = new Date();
    quotation.acceptedByCustomerUser = req.customerUser._id;
    await quotation.save();

    await Activity.create({
      action: 'Quotation Accepted by Customer',
      module: 'Quotation',
      details: `Customer contact ${req.customerUser.name} (${req.customerUser.email}) officially accepted quotation ${quotation.quotationNumber} via Customer Portal`,
      customerUser: req.customerUser._id,
      branch: quotation.branch,
      userName: req.customerUser.name,
    });

    res.json({
      success: true,
      message: `Quotation ${quotation.quotationNumber} has been accepted successfully. Our operations team has been notified.`,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Reject quotation from portal
// @route   POST /api/portal/quotations/:id/reject
// @access  Private (Customer Portal)
export const rejectPortalQuotation = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A reason for declining the quotation is required',
      });
    }

    const quotation = await Quotation.findOne({
      _id: req.params.id,
      customer: req.customerId,
    }).populate('customer');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found or you are not authorized',
      });
    }

    if (quotation.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `This quotation cannot be rejected because its status is '${quotation.status}'.`,
      });
    }

    quotation.status = 'Rejected';
    quotation.rejectedAt = new Date();
    quotation.rejectionReason = rejectionReason.trim();
    quotation.rejectedByCustomerUser = req.customerUser._id;
    await quotation.save();

    await Activity.create({
      action: 'Quotation Declined by Customer',
      module: 'Quotation',
      details: `Customer contact ${req.customerUser.name} declined quotation ${quotation.quotationNumber}. Reason: "${rejectionReason.trim()}"`,
      customerUser: req.customerUser._id,
      branch: quotation.branch,
      userName: req.customerUser.name,
    });

    res.json({
      success: true,
      message: `Quotation ${quotation.quotationNumber} has been marked as declined.`,
      data: quotation,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 3. SHIPMENTS & TRACKING
// ==========================================

// @desc    Get customer shipments
// @route   GET /api/portal/shipments
// @access  Private (Customer Portal)
export const getPortalShipments = async (req, res, next) => {
  try {
    const shipments = await Shipment.find({ customer: req.customerId })
      .select('-internalRemarks')
      .populate('branch', 'name code city country')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get customer shipment details
// @route   GET /api/portal/shipments/:id
// @access  Private (Customer Portal)
export const getPortalShipmentById = async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      customer: req.customerId,
    })
      .select('-internalRemarks')
      .populate('branch', 'name code city country email phone');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found or access denied',
      });
    }

    // Milestones
    const milestones = await ShipmentMilestone.find({
      shipment: shipment._id,
    }).sort({ order: 1 });

    // Customer-visible documents only
    const documents = await ShipmentDocument.find({
      shipment: shipment._id,
      isCustomerVisible: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...shipment.toObject(),
        milestones,
        documents,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get milestones for customer shipment
// @route   GET /api/portal/shipments/:id/milestones
// @access  Private (Customer Portal)
export const getPortalShipmentMilestones = async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      customer: req.customerId,
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment not found or access denied',
      });
    }

    const milestones = await ShipmentMilestone.find({
      shipment: shipment._id,
    }).sort({ order: 1 });

    res.json({
      success: true,
      count: milestones.length,
      data: milestones,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 4. DOCUMENTS REPOSITORY
// ==========================================

// @desc    Get all customer-visible documents across all customer shipments
// @route   GET /api/portal/documents
// @access  Private (Customer Portal)
export const getPortalDocuments = async (req, res, next) => {
  try {
    // Find all shipments for this customer
    const shipments = await Shipment.find({ customer: req.customerId }).select(
      '_id shipmentNumber origin destination status freightType'
    );
    const shipmentIds = shipments.map((s) => s._id);

    // Fetch documents strictly with isCustomerVisible: true
    const documents = await ShipmentDocument.find({
      shipment: { $in: shipmentIds },
      isCustomerVisible: true,
    })
      .populate('shipment', 'shipmentNumber origin destination status freightType')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Download customer-visible document
// @route   GET /api/portal/documents/:id/download
// @access  Private (Customer Portal)
export const downloadPortalDocument = async (req, res, next) => {
  try {
    const document = await ShipmentDocument.findById(req.params.id).populate('shipment');

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Strict privacy enforcement: must be customer visible
    if (!document.isCustomerVisible) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: This document is an internal operations record.',
      });
    }

    // Verify document belongs to customer's shipment
    const docCustomerId = document.shipment?.customer?.toString();
    if (docCustomerId !== req.customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Document does not belong to your company shipments.',
      });
    }

    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Physical document file not found on server storage',
      });
    }

    res.download(document.filePath, document.originalName);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 5. INVOICES & PAYMENTS
// ==========================================

// @desc    Get customer invoices (Drafts strictly excluded)
// @route   GET /api/portal/invoices
// @access  Private (Customer Portal)
export const getPortalInvoices = async (req, res, next) => {
  try {
    const invoices = await Invoice.find({
      customer: req.customerId,
      status: { $in: ['Issued', 'Partially Paid', 'Paid', 'Overdue'] },
    })
      .select('-internalNotes')
      .populate('branch', 'name code city country')
      .populate('shipment', 'shipmentNumber origin destination')
      .sort({ invoiceDate: -1 });

    res.json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get customer invoice details
// @route   GET /api/portal/invoices/:id
// @access  Private (Customer Portal)
export const getPortalInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      customer: req.customerId,
      status: { $in: ['Issued', 'Partially Paid', 'Paid', 'Overdue'] },
    })
      .select('-internalNotes')
      .populate('branch', 'name code address email phone')
      .populate('shipment', 'shipmentNumber origin destination freightType weight volume packages')
      .populate('quotation', 'quotationNumber');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or access denied',
      });
    }

    res.json({
      success: true,
      data: invoice,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Download customer invoice PDF
// @route   GET /api/portal/invoices/:id/pdf
// @access  Private (Customer Portal)
export const downloadPortalInvoicePdf = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      customer: req.customerId,
      status: { $in: ['Issued', 'Partially Paid', 'Paid', 'Overdue'] },
    })
      .populate('customer')
      .populate('branch')
      .populate('shipment');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or access denied',
      });
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// @desc    Get customer receipts / payment records
// @route   GET /api/portal/receipts
// @access  Private (Customer Portal)
export const getPortalReceipts = async (req, res, next) => {
  try {
    const receipts = await CustomerReceipt.find({
      customer: req.customerId,
      status: { $ne: 'Void' },
    })
      .populate('branch', 'name code')
      .sort({ receiptDate: -1 });

    res.json({
      success: true,
      count: receipts.length,
      data: receipts,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 6. PROFILE & SETTINGS
// ==========================================

// @desc    Get customer user profile and company info
// @route   GET /api/portal/profile
// @access  Private (Customer Portal)
export const getPortalProfile = async (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        _id: req.customerUser._id,
        name: req.customerUser.name,
        email: req.customerUser.email,
        phone: req.customerUser.phone,
        status: req.customerUser.status,
        lastLogin: req.customerUser.lastLogin,
      },
      customer: req.customer,
    },
  });
};

// @desc    Update customer permitted profile fields
// @route   PUT /api/portal/profile
// @access  Private (Customer Portal)
export const updatePortalProfile = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;

    if (name) req.customerUser.name = name.trim();
    if (phone !== undefined) req.customerUser.phone = phone.trim();
    await req.customerUser.save();

    // Update customer contact info
    if (name) req.customer.contactPerson = name.trim();
    if (phone !== undefined) req.customer.phone = phone.trim();
    if (address !== undefined) req.customer.address = address.trim();
    await req.customer.save();

    await Activity.create({
      action: 'Portal Profile Updated',
      module: 'Portal',
      details: `Customer contact ${req.customerUser.name} updated profile information via Customer Portal`,
      customerUser: req.customerUser._id,
      branch: req.customer.branch,
      userName: req.customerUser.name,
    });

    res.json({
      success: true,
      message: 'Profile information updated successfully',
      data: {
        user: {
          _id: req.customerUser._id,
          name: req.customerUser.name,
          email: req.customerUser.email,
          phone: req.customerUser.phone,
          status: req.customerUser.status,
        },
        customer: req.customer,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Change portal password
// @route   PUT /api/portal/profile/password
// @access  Private (Customer Portal)
export const changePortalPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    const user = await CustomerUser.findById(req.customerUser._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match our records',
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (err) {
    next(err);
  }
};
