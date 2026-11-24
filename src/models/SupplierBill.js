import mongoose from 'mongoose';

const billLineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, default: 1, min: 0.01 },
  unitPrice: { type: Number, required: true, default: 0, min: 0 },
  amount: { type: Number, required: true, default: 0 },
});

const billPaymentRecordSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierPayment' },
  paymentNumber: { type: String },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const supplierBillSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true, index: true },
    supplierInvoiceReference: { type: String, default: '', trim: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    branchCode: { type: String, default: 'HQ-DXB' },
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
    billDate: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date, required: true },
    currency: { type: String, default: 'USD', required: true },
    description: { type: String, default: '' },
    lineItems: [billLineItemSchema],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0, required: true },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Approved', 'Partially Paid', 'Paid', 'Overdue', 'Void'],
      default: 'Draft',
      index: true,
    },
    internalNotes: { type: String, default: '' },
    attachment: { type: String, default: '' },
    paymentHistory: [billPaymentRecordSchema],
    recordedAt: { type: Date },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('SupplierBill', supplierBillSchema);
