import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import Shipment, { SHIPMENT_STATUSES } from '../models/Shipment.js';
import ShipmentMilestone, { DEFAULT_MILESTONE_TITLES } from '../models/ShipmentMilestone.js';
import ShipmentDocument from '../models/ShipmentDocument.js';
import Customer from '../models/Customer.js';
import Activity from '../models/Activity.js';

// Helper: Generate next sequential shipment number
export const generateNextShipmentNumber = async () => {
  const year = new Date().getFullYear();
  const count = await Shipment.countDocuments();
  const pad = String(count + 1).padStart(5, '0');
  return `SHP-${year}-${pad}`;
};

// Helper: Initialize 8 default milestones for a shipment
export const initializeDefaultMilestones = async (shipment, user) => {
  const milestoneDocs = DEFAULT_MILESTONE_TITLES.map((title, index) => {
    const isFirst = index === 0;
    return {
      shipment: shipment._id,
      title,
      order: index + 1,
      status: isFirst ? 'Completed' : 'Pending',
      completedDate: isFirst ? new Date() : undefined,
      completedBy: isFirst ? user?._id : undefined,
      completedByName: isFirst ? user?.name : '',
      remarks: isFirst ? 'Initial booking confirmed in system.' : '',
      isCustom: false,
      branch: shipment.branch,
    };
  });

  return await ShipmentMilestone.insertMany(milestoneDocs);
};

// Helper: Send shipment email notifications safely
export const sendShipmentNotification = async (shipment, eventType, extraData = {}) => {
  try {
    const customer = await Customer.findById(shipment.customer);
    const recipient = customer?.email;
    if (!recipient) return;

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const subject = `[FreightERP] Shipment ${shipment.shipmentNumber} Notification: ${eventType}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
        <h2 style="color: #0F172A;">Shipment Update: ${shipment.shipmentNumber}</h2>
        <p>Dear ${customer.contactPerson || customer.companyName},</p>
        <p>Your freight shipment has a new status notification:</p>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Status:</strong> ${shipment.status}</p>
          <p><strong>Route:</strong> ${shipment.origin} &rarr; ${shipment.destination}</p>
          <p><strong>Mode:</strong> ${shipment.freightType}</p>
          ${extraData.remarks ? `<p><strong>Remarks:</strong> ${extraData.remarks}</p>` : ''}
        </div>
        <p>Best regards,<br/><strong>FreightERP Operations</strong></p>
      </div>
    `;

    if (smtpHost && smtpUser) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: `"FreightERP Operations" <${smtpUser}>`,
        to: recipient,
        subject,
        html,
      });
    } else {
      console.log(`[SMTP SIMULATED] Notification (${eventType}) sent to ${recipient} for ${shipment.shipmentNumber}`);
    }
  } catch (err) {
    console.warn('[Notification Error] Non-blocking email error:', err.message);
  }
};

// @desc    Get all shipments (search, filters, pagination, branch scoping)
// @route   GET /api/shipments
// @access  Private
export const getShipments = async (req, res, next) => {
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
    if (req.query.status && req.query.status !== 'All') {
      query.status = req.query.status;
    }

    // Freight mode filter
    if (req.query.freightType && req.query.freightType !== 'All') {
      query.freightType = req.query.freightType;
    }

    // Customer filter
    if (req.query.customerId) {
      query.customer = req.query.customerId;
    }

    // Date range filter (by createdAt, etd, or eta)
    if (req.query.startDate && req.query.endDate) {
      const dateField = req.query.dateField || 'createdAt';
      query[dateField] = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // Search query across shipmentNumber, customer name, origin, destination, carrier, master/house ref
    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');

      // Find matching customer IDs first
      const matchingCustomers = await Customer.find({
        $or: [{ companyName: regex }, { contactPerson: regex }],
      }).select('_id');
      const custIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { shipmentNumber: regex },
        { origin: regex },
        { destination: regex },
        { carrier: regex },
        { masterReference: regex },
        { houseReference: regex },
        { containerNumber: regex },
        { customer: { $in: custIds } },
      ];
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Sorting
    let sort = { createdAt: -1 };
    if (req.query.sortBy) {
      const order = req.query.sortOrder === 'asc' ? 1 : -1;
      sort = { [req.query.sortBy]: order };
    }

    const [total, shipments] = await Promise.all([
      Shipment.countDocuments(query),
      Shipment.find(query)
        .populate('customer', 'customerCode companyName contactPerson email phone')
        .populate('branch', 'name code city country')
        .populate('quotation', 'quotationNumber totalAmount currency')
        .populate('assignedTo', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      count: shipments.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: shipments,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single shipment by ID with milestones and documents
// @route   GET /api/shipments/:id
// @access  Private
export const getShipmentById = async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate('customer')
      .populate('branch', 'name code city country address phone email')
      .populate('quotation')
      .populate('assignedTo', 'name email phone department')
      .populate('createdBy', 'name email');

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // Strict branch scoping verification
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const shipmentBranchId = shipment.branch?._id?.toString() || shipment.branch?.toString();
      if (userBranchId !== shipmentBranchId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to view shipments from another branch.',
        });
      }
    }

    // Fetch related milestones and documents in parallel
    const [milestones, documents] = await Promise.all([
      ShipmentMilestone.find({ shipment: shipment._id }).sort({ order: 1 }),
      ShipmentDocument.find({ shipment: shipment._id })
        .populate('uploadedBy', 'name email')
        .sort({ uploadDate: -1 }),
    ]);

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

// @desc    Create manual shipment (without quotation)
// @route   POST /api/shipments
// @access  Private (Super Admin, Branch Admin, Operations)
export const createShipment = async (req, res, next) => {
  try {
    const {
      customer: customerId,
      customerReference,
      freightType,
      shipmentDate,
      branch: branchId,
      assignedTo,
      internalRemarks,
      // Route
      originCountry,
      originCity,
      originPort,
      origin,
      destinationCountry,
      destinationCity,
      destinationPort,
      destination,
      placeOfReceipt,
      placeOfDelivery,
      // Cargo
      cargoDescription,
      packages,
      packageType,
      weight,
      weightUnit,
      volume,
      volumeUnit,
      chargeableWeight,
      commodityType,
      hsCode,
      dangerousGoods,
      specialHandling,
      // Transport
      shipper,
      consignee,
      notifyParty,
      carrier,
      masterReference,
      houseReference,
      bookingReference,
      containerNumber,
      vesselFlight,
      // Schedule
      etd,
      eta,
      actualDeparture,
      actualArrival,
      // Financial
      freightCharges,
      additionalCharges,
      discount,
      tax,
      agreedCharges,
      currency,
      status,
    } = req.body;

    // Validate customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(400).json({ success: false, message: 'Valid customer is required' });
    }

    // Branch assignment security
    let assignedBranch = req.user.role === 'Super Admin' && branchId
      ? branchId
      : (req.user.branch?._id || req.user.branch);

    if (!assignedBranch) {
      assignedBranch = customer.branch;
    }

    // Auto-generate sequential shipment number
    const shipmentNumber = await generateNextShipmentNumber();

    // Compute display origin/destination if not explicitly provided
    const displayOrigin = origin || [originPort, originCity, originCountry].filter(Boolean).join(', ') || 'Origin Hub';
    const displayDestination = destination || [destinationPort, destinationCity, destinationCountry].filter(Boolean).join(', ') || 'Destination Hub';

    const initialStatus = status || 'Booked';

    const shipment = await Shipment.create({
      shipmentNumber,
      customer: customer._id,
      customerReference: customerReference || '',
      freightType: freightType || 'Sea Freight FCL',
      shipmentDate: shipmentDate ? new Date(shipmentDate) : new Date(),
      branch: assignedBranch,
      assignedTo: assignedTo || req.user._id,
      internalRemarks: internalRemarks || '',
      // Route
      originCountry: originCountry || '',
      originCity: originCity || '',
      originPort: originPort || '',
      origin: displayOrigin,
      destinationCountry: destinationCountry || '',
      destinationCity: destinationCity || '',
      destinationPort: destinationPort || '',
      destination: displayDestination,
      placeOfReceipt: placeOfReceipt || '',
      placeOfDelivery: placeOfDelivery || '',
      // Cargo
      cargoDescription: cargoDescription || 'General Cargo',
      packages: Number(packages) || 1,
      packageType: packageType || 'Packages',
      weight: Number(weight) || 0,
      weightUnit: weightUnit || 'KG',
      volume: Number(volume) || 0,
      volumeUnit: volumeUnit || 'CBM',
      chargeableWeight: Number(chargeableWeight) || Number(weight) || 0,
      commodityType: commodityType || 'General',
      hsCode: hsCode || '',
      dangerousGoods: Boolean(dangerousGoods),
      specialHandling: specialHandling || '',
      // Transport
      shipper: shipper || customer.companyName,
      consignee: consignee || customer.contactPerson || 'To Order',
      notifyParty: notifyParty || '',
      carrier: carrier || '',
      masterReference: masterReference || '',
      houseReference: houseReference || '',
      bookingReference: bookingReference || '',
      containerNumber: containerNumber || '',
      vesselFlight: vesselFlight || '',
      // Schedule
      etd: etd ? new Date(etd) : undefined,
      eta: eta ? new Date(eta) : undefined,
      actualDeparture: actualDeparture ? new Date(actualDeparture) : undefined,
      actualArrival: actualArrival ? new Date(actualArrival) : undefined,
      // Financial
      freightCharges: Number(freightCharges) || 0,
      additionalCharges: Number(additionalCharges) || 0,
      discount: Number(discount) || 0,
      tax: Number(tax) || 0,
      agreedCharges: Number(agreedCharges) || Number(freightCharges) || 0,
      currency: currency || customer.currency || 'USD',
      invoiceStatus: 'Unbilled',
      // Status & Initial History
      status: initialStatus,
      statusHistory: [
        {
          previousStatus: '',
          newStatus: initialStatus,
          changedBy: req.user._id,
          changedByName: req.user.name,
          date: new Date(),
          remarks: 'Shipment created manually in system.',
        },
      ],
      createdBy: req.user._id,
    });

    // Auto initialize the 8 default milestones
    await initializeDefaultMilestones(shipment, req.user);

    // Audit log
    await Activity.create({
      action: 'Shipment Created',
      module: 'Shipment',
      details: `Created shipment ${shipment.shipmentNumber} for ${customer.companyName} (${shipment.freightType})`,
      user: req.user._id,
      userName: req.user.name,
      branch: assignedBranch,
    });

    // Send notification
    sendShipmentNotification(shipment, 'Created');

    const populated = await Shipment.findById(shipment._id)
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code city country');

    res.status(201).json({
      success: true,
      message: 'Shipment created successfully',
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update shipment details
// @route   PUT /api/shipments/:id
// @access  Private (Super Admin, Branch Admin, Operations)
export const updateShipment = async (req, res, next) => {
  try {
    let shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const shipmentBranchId = shipment.branch?._id?.toString() || shipment.branch?.toString();
      if (userBranchId !== shipmentBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied: You cannot edit another branch shipment.' });
      }
      delete req.body.branch;
      delete req.body.shipmentNumber;
    }

    // Role check: Sales and Accounts cannot edit operational details
    if (['Sales', 'Accounts'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Your role does not have operational editing permissions for shipments.',
      });
    }

    // Update fields
    const updated = await Shipment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('customer', 'customerCode companyName contactPerson')
      .populate('branch', 'name code');

    await Activity.create({
      action: 'Shipment Updated',
      module: 'Shipment',
      details: `Updated details for shipment ${updated.shipmentNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: updated.branch?._id || updated.branch,
    });

    res.json({
      success: true,
      message: 'Shipment updated successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update shipment status with history tracking and notifications
// @route   PUT /api/shipments/:id/status
// @access  Private (Super Admin, Branch Admin, Operations)
export const updateShipmentStatus = async (req, res, next) => {
  try {
    const { status, remarks } = req.body;

    if (!SHIPMENT_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid shipment status. Allowed values: ${SHIPMENT_STATUSES.join(', ')}`,
      });
    }

    const shipment = await Shipment.findById(req.params.id).populate('customer').populate('branch');
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // Branch authorization check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const shipmentBranchId = shipment.branch?._id?.toString() || shipment.branch?.toString();
      if (userBranchId !== shipmentBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied to this shipment' });
      }
    }

    // Role check
    if (['Sales', 'Accounts'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Your role is not authorized to update shipment operational status.',
      });
    }

    const previousStatus = shipment.status;

    // Append to statusHistory
    shipment.statusHistory.push({
      previousStatus,
      newStatus: status,
      changedBy: req.user._id,
      changedByName: req.user.name,
      date: new Date(),
      remarks: remarks || `Status changed from ${previousStatus} to ${status}`,
    });

    shipment.status = status;

    // Status-specific automated side effects
    if (status === 'Delivered') {
      shipment.deliveryDate = new Date();
      // Auto complete the 'Delivered' milestone if present
      await ShipmentMilestone.updateOne(
        { shipment: shipment._id, title: 'Delivered' },
        {
          $set: {
            status: 'Completed',
            completedDate: new Date(),
            completedBy: req.user._id,
            completedByName: req.user.name,
            remarks: remarks || 'Shipment delivered to consignee.',
          },
        }
      );
    } else if (status === 'Arrived at Destination') {
      shipment.actualArrival = new Date();
      await ShipmentMilestone.updateOne(
        { shipment: shipment._id, title: 'Arrived at Destination' },
        {
          $set: {
            status: 'Completed',
            completedDate: new Date(),
            completedBy: req.user._id,
            completedByName: req.user.name,
          },
        }
      );
    }

    await shipment.save();

    await Activity.create({
      action: 'Shipment Status Changed',
      module: 'Shipment',
      details: `Shipment ${shipment.shipmentNumber} status changed: ${previousStatus} &rarr; ${status}`,
      user: req.user._id,
      userName: req.user.name,
      branch: shipment.branch?._id || shipment.branch,
    });

    // Dispatch email notification
    sendShipmentNotification(shipment, `Status: ${status}`, { remarks });

    res.json({
      success: true,
      message: `Shipment status updated to ${status}`,
      data: shipment,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete shipment (Draft or Cancelled only)
// @route   DELETE /api/shipments/:id
// @access  Private (Super Admin, Branch Admin)
export const deleteShipment = async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const shipmentBranchId = shipment.branch?._id?.toString() || shipment.branch?.toString();
      if (userBranchId !== shipmentBranchId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Only Draft or Cancelled shipments can be safely deleted
    if (!['Draft', 'Cancelled'].includes(shipment.status) && req.user.role !== 'Super Admin') {
      return res.status(400).json({
        success: false,
        message: 'Only Draft or Cancelled shipments can be deleted.',
      });
    }

    // Cleanup milestones and documents
    await Promise.all([
      ShipmentMilestone.deleteMany({ shipment: shipment._id }),
      ShipmentDocument.deleteMany({ shipment: shipment._id }),
      Shipment.findByIdAndDelete(req.params.id),
    ]);

    await Activity.create({
      action: 'Shipment Deleted',
      module: 'Shipment',
      details: `Deleted shipment ${shipment.shipmentNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: shipment.branch,
    });

    res.json({ success: true, message: 'Shipment deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// --- MILESTONE CONTROLLERS ---

// @desc    Get milestones for a shipment
// @route   GET /api/shipments/:id/milestones
// @access  Private
export const getShipmentMilestones = async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Branch scoping check
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== shipment.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const milestones = await ShipmentMilestone.find({ shipment: req.params.id }).sort({ order: 1 });
    res.json({ success: true, count: milestones.length, data: milestones });
  } catch (err) {
    next(err);
  }
};

// @desc    Add a custom milestone
// @route   POST /api/shipments/:id/milestones
// @access  Private (Super Admin, Branch Admin, Operations)
export const createShipmentMilestone = async (req, res, next) => {
  try {
    const { title, remarks, status, completedDate } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Milestone title is required' });
    }

    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== shipment.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const highestOrder = await ShipmentMilestone.findOne({ shipment: shipment._id })
      .sort({ order: -1 })
      .select('order');
    const nextOrder = (highestOrder?.order || 0) + 1;

    const isCompleted = status === 'Completed';

    const milestone = await ShipmentMilestone.create({
      shipment: shipment._id,
      title: title.trim(),
      order: nextOrder,
      status: status || 'Pending',
      completedDate: isCompleted ? (completedDate ? new Date(completedDate) : new Date()) : undefined,
      completedBy: isCompleted ? req.user._id : undefined,
      completedByName: isCompleted ? req.user.name : '',
      remarks: remarks || '',
      isCustom: true,
      branch: shipment.branch,
    });

    await Activity.create({
      action: 'Milestone Added',
      module: 'Shipment',
      details: `Added custom milestone '${milestone.title}' to shipment ${shipment.shipmentNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: shipment.branch,
    });

    res.status(201).json({ success: true, data: milestone });
  } catch (err) {
    next(err);
  }
};

// @desc    Update milestone (Pending, Completed, Delayed)
// @route   PUT /api/shipments/:id/milestones/:milestoneId
// @access  Private (Super Admin, Branch Admin, Operations)
export const updateShipmentMilestone = async (req, res, next) => {
  try {
    const { status, remarks, completedDate } = req.body;

    const milestone = await ShipmentMilestone.findById(req.params.milestoneId);
    if (!milestone) return res.status(404).json({ success: false, message: 'Milestone not found' });

    const shipment = await Shipment.findById(milestone.shipment);

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== milestone.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (status) milestone.status = status;
    if (remarks !== undefined) milestone.remarks = remarks;

    if (status === 'Completed') {
      milestone.completedDate = completedDate ? new Date(completedDate) : new Date();
      milestone.completedBy = req.user._id;
      milestone.completedByName = req.user.name;
    } else if (status === 'Pending') {
      milestone.completedDate = undefined;
      milestone.completedBy = undefined;
      milestone.completedByName = '';
    } else if (status === 'Delayed') {
      // If marked delayed, dispatch delay alert notification
      sendShipmentNotification(shipment, 'Milestone Delayed', { remarks: `${milestone.title} delayed: ${remarks || ''}` });
    }

    await milestone.save();

    await Activity.create({
      action: 'Milestone Updated',
      module: 'Shipment',
      details: `Milestone '${milestone.title}' on shipment ${shipment.shipmentNumber} marked as ${milestone.status}`,
      user: req.user._id,
      userName: req.user.name,
      branch: milestone.branch,
    });

    res.json({ success: true, data: milestone });
  } catch (err) {
    next(err);
  }
};

// --- DOCUMENT CONTROLLERS ---

// @desc    Get all documents for a shipment
// @route   GET /api/shipments/:id/documents
// @access  Private
export const getShipmentDocuments = async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== shipment.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const documents = await ShipmentDocument.find({ shipment: shipment._id })
      .populate('uploadedBy', 'name email')
      .sort({ uploadDate: -1 });

    res.json({ success: true, count: documents.length, data: documents });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload document for a shipment
// @route   POST /api/shipments/:id/documents
// @access  Private (Super Admin, Branch Admin, Operations)
export const uploadShipmentDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { title, category } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Document title is required' });
    }

    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      // Remove uploaded file if shipment not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== shipment.branch.toString()) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ success: false, message: 'Access denied: You cannot upload to another branch shipment.' });
      }
    }

    const document = await ShipmentDocument.create({
      shipment: shipment._id,
      title: title.trim(),
      category: category || 'Other Documents',
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
      branch: shipment.branch,
      uploadDate: new Date(),
    });

    await Activity.create({
      action: 'Document Uploaded',
      module: 'Shipment',
      details: `Uploaded '${document.title}' (${document.category}) to shipment ${shipment.shipmentNumber}`,
      user: req.user._id,
      userName: req.user.name,
      branch: shipment.branch,
    });

    res.status(201).json({ success: true, data: document });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

// @desc    Download document with strict authorization check
// @route   GET /api/shipments/:id/documents/:documentId/download
// @access  Private
export const downloadShipmentDocument = async (req, res, next) => {
  try {
    const document = await ShipmentDocument.findById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Enforce branch-level data isolation
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      const docBranchId = document.branch?.toString();
      if (userBranchId !== docBranchId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to download documents from another branch.',
        });
      }
    }

    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server storage' });
    }

    res.download(document.filePath, document.originalName);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete shipment document
// @route   DELETE /api/shipments/:id/documents/:documentId
// @access  Private (Super Admin, Branch Admin, Operations)
export const deleteShipmentDocument = async (req, res, next) => {
  try {
    const document = await ShipmentDocument.findById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== document.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Role check
    if (['Sales', 'Accounts'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Your role cannot delete shipment documents.',
      });
    }

    // Remove file from disk
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await ShipmentDocument.findByIdAndDelete(document._id);

    await Activity.create({
      action: 'Document Deleted',
      module: 'Shipment',
      details: `Deleted document '${document.title}'`,
      user: req.user._id,
      userName: req.user.name,
      branch: document.branch,
    });

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get audit activities for a shipment
// @route   GET /api/shipments/:id/activities
// @access  Private
export const getShipmentActivities = async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Branch scoping
    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== shipment.branch.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const activities = await Activity.find({
      module: 'Shipment',
      details: new RegExp(shipment.shipmentNumber, 'i'),
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ success: true, count: activities.length, data: activities });
  } catch (err) {
    next(err);
  }
};

// @desc    Export shipments as CSV
// @route   GET /api/shipments/export/csv
// @access  Private
export const exportShipmentsCsv = async (req, res, next) => {
  try {
    let query = {};
    if (req.user.role !== 'Super Admin') {
      query.branch = req.user.branch?._id || req.user.branch;
    } else if (req.query.branchId) {
      query.branch = req.query.branchId;
    }

    if (req.query.status && req.query.status !== 'All') {
      query.status = req.query.status;
    }
    if (req.query.freightType && req.query.freightType !== 'All') {
      query.freightType = req.query.freightType;
    }

    const shipments = await Shipment.find(query)
      .populate('customer', 'companyName')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 });

    const headers = [
      'Shipment Number',
      'Customer',
      'Freight Mode',
      'Origin',
      'Destination',
      'ETD',
      'ETA',
      'Status',
      'Agreed Total',
      'Currency',
      'Branch',
      'Created Date',
    ];

    const rows = shipments.map((s) => [
      `"${s.shipmentNumber}"`,
      `"${s.customer?.companyName || ''}"`,
      `"${s.freightType}"`,
      `"${s.origin.replace(/"/g, '""')}"`,
      `"${s.destination.replace(/"/g, '""')}"`,
      s.etd ? `"${new Date(s.etd).toISOString().slice(0, 10)}"` : '""',
      s.eta ? `"${new Date(s.eta).toISOString().slice(0, 10)}"` : '""',
      `"${s.status}"`,
      s.agreedCharges || 0,
      `"${s.currency}"`,
      `"${s.branch?.name || ''}"`,
      `"${new Date(s.createdAt).toISOString().slice(0, 10)}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="shipments_export.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};
