import mongoose from 'mongoose';

export const SHIPMENT_STATUSES = [
  'Draft',
  'Booked',
  'Cargo Received',
  'In Transit',
  'Arrived at Destination',
  'Customs Clearance',
  'Out for Delivery',
  'Delivered',
  'On Hold',
  'Cancelled',
];

export const FREIGHT_TYPES = [
  'Air Freight',
  'Sea Freight FCL',
  'Sea Freight LCL',
  'Road Freight',
  'Rail Freight',
  'Multimodal Freight',
  'Courier / Express',
  // Backwards compatibility variants
  'Air',
  'Sea FCL',
  'Sea LCL',
  'Road',
  'Rail',
  'Multimodal',
  'Courier',
];

const statusHistorySchema = new mongoose.Schema(
  {
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedByName: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    remarks: { type: String, default: '' },
  },
  { _id: true }
);

const shipmentSchema = new mongoose.Schema(
  {
    // Auto-generated sequential identifier
    shipmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required'],
    },
    customerReference: {
      type: String,
      trim: true,
      default: '',
    },
    quotation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    freightType: {
      type: String,
      required: [true, 'Freight type is required'],
      default: 'Sea Freight FCL',
    },
    shipmentDate: {
      type: Date,
      default: Date.now,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    internalRemarks: {
      type: String,
      default: '',
    },

    // Route Information
    originCountry: { type: String, default: '' },
    originCity: { type: String, default: '' },
    originPort: { type: String, default: '' },
    origin: { type: String, required: true }, // Display origin
    destinationCountry: { type: String, default: '' },
    destinationCity: { type: String, default: '' },
    destinationPort: { type: String, default: '' },
    destination: { type: String, required: true }, // Display destination
    placeOfReceipt: { type: String, default: '' },
    placeOfDelivery: { type: String, default: '' },

    // Cargo Information
    cargoDescription: { type: String, default: 'General Cargo' },
    packages: { type: Number, default: 1 },
    packageType: { type: String, default: 'Packages' },
    weight: { type: Number, default: 0 }, // Gross weight
    weightUnit: { type: String, enum: ['KG', 'LB'], default: 'KG' },
    volume: { type: Number, default: 0 },
    volumeUnit: { type: String, enum: ['CBM', 'CFT'], default: 'CBM' },
    chargeableWeight: { type: Number, default: 0 },
    commodityType: { type: String, default: 'General' },
    hsCode: { type: String, default: '' },
    dangerousGoods: { type: Boolean, default: false },
    specialHandling: { type: String, default: '' },

    // Transport Information
    shipper: { type: String, default: '' },
    consignee: { type: String, default: '' },
    notifyParty: { type: String, default: '' },
    carrier: { type: String, default: '' }, // Airline, Shipping Line, etc.
    masterReference: { type: String, default: '' }, // Master B/L or AWB
    houseReference: { type: String, default: '' }, // House B/L or AWB
    bookingReference: { type: String, default: '' },
    containerNumber: { type: String, default: '' }, // Optional, for FCL/Sea
    vesselFlight: { type: String, default: '' }, // Vessel/Voyage, Flight #, Train, etc.

    // Schedule Information
    etd: { type: Date },
    eta: { type: Date },
    actualDeparture: { type: Date },
    actualArrival: { type: Date },
    deliveryDate: { type: Date },

    // Commercial & Financial Summary
    freightCharges: { type: Number, default: 0 },
    additionalCharges: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    agreedCharges: { type: Number, default: 0 }, // totalAgreedAmount
    currency: { type: String, default: 'USD', uppercase: true },
    invoiceStatus: {
      type: String,
      enum: ['Unbilled', 'Invoiced', 'Paid'],
      default: 'Unbilled',
    },
    linkedInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },

    // Status & Milestones
    status: {
      type: String,
      enum: SHIPMENT_STATUSES,
      default: 'Booked',
    },
    statusHistory: [statusHistorySchema],

    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup & filtering
shipmentSchema.index({ customer: 1 });
shipmentSchema.index({ branch: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ quotation: 1 });
shipmentSchema.index({ eta: 1 });

export default mongoose.model('Shipment', shipmentSchema);
