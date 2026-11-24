import mongoose from 'mongoose';

const chargeItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    revision: {
      type: Number,
      default: 1,
    },
    parentQuotation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required'],
    },
    contactPerson: {
      type: String,
      default: '',
    },
    freightType: {
      type: String,
      enum: [
        'Air',
        'Sea FCL',
        'Sea LCL',
        'Road',
        'Rail',
        'Multimodal',
        'Courier',
        'Air Freight',
        'Sea Freight',
        'Road Freight',
        'Rail Freight',
        'Multimodal Freight',
        'Courier / Express',
      ],
      default: 'Sea FCL',
    },
    origin: {
      type: String,
      required: [true, 'Origin is required'],
      trim: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    cargoDescription: {
      type: String,
      default: '',
      trim: true,
    },
    grossWeight: {
      type: Number,
      default: 0,
    },
    volumeCbm: {
      type: Number,
      default: 0,
    },
    packagesCount: {
      type: Number,
      default: 1,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    freightCharges: {
      type: Number,
      default: 0,
    },
    additionalChargeItems: [chargeItemSchema],
    additionalCharges: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    validityDate: {
      type: Date,
    },
    termsAndConditions: {
      type: String,
      default: 'Standard freight forwarding terms apply. Quotation valid until indicated date.',
    },
    internalNotes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'],
      default: 'Draft',
    },
    isConvertedToShipment: {
      type: Boolean,
      default: false,
    },
    convertedShipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Quotation', quotationSchema);
