import mongoose from 'mongoose';

const invoiceLineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, default: 1, min: 0.01 },
  unitPrice: { type: Number, required: true, default: 0, min: 0 },
  amount: { type: Number, required: true, default: 0 },
});

const invoicePaymentRecordSchema = new mongoose.Schema({
  receipt: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerReceipt' },
  receiptNumber: { type: String },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerBillingAddress: { type: String, default: '' },
    customerTaxNumber: { type: String, default: '' },
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    branchCode: { type: String, default: 'HQ-DXB' },
    invoiceDate: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date, required: true },
    currency: { type: String, default: 'USD', required: true },
    paymentTerms: { type: String, default: 'Net 30 Days' },
    lineItems: [invoiceLineItemSchema],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0, required: true },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Void'],
      default: 'Draft',
      index: true,
    },
    internalNotes: { type: String, default: '' },
    customerNotes: { type: String, default: 'Thank you for choosing FreightERP for your global logistics.' },
    paymentHistory: [invoicePaymentRecordSchema],
    emailHistory: [
      {
        sentTo: { type: String },
        sentAt: { type: Date, default: Date.now },
        sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        simulated: { type: Boolean, default: false },
        messageId: { type: String },
      },
    ],
    issuedAt: { type: Date },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Invoice', invoiceSchema);
