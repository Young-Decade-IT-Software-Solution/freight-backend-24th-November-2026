import mongoose from 'mongoose';

export const DOCUMENT_CATEGORIES = [
  'Commercial Invoice',
  'Packing List',
  'Bill of Lading',
  'Air Waybill',
  'Delivery Order',
  'Customs Documents',
  'Certificate of Origin',
  'Insurance Documents',
  'Other Documents',
];

const shipmentDocumentSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      required: [true, 'Document category is required'],
      default: 'Other Documents',
    },
    fileName: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedByName: {
      type: String,
      default: '',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    isCustomerVisible: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

shipmentDocumentSchema.index({ shipment: 1, category: 1 });

export default mongoose.model('ShipmentDocument', shipmentDocumentSchema);
