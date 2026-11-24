import mongoose from 'mongoose';

const receiptAllocationSchema = new mongoose.Schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  invoiceNumber: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01 },
});

const customerReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, index: true },
    receiptDate: { type: Date, default: Date.now, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    branchCode: { type: String, default: 'HQ-DXB' },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'Other'],
      default: 'Bank Transfer',
      required: true,
    },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount', required: true },
    transactionReference: { type: String, default: '' },
    currency: { type: String, default: 'USD', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    allocatedAmount: { type: Number, default: 0 },
    unallocatedAmount: { type: Number, default: 0 },
    allocations: [receiptAllocationSchema],
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Reversed'],
      default: 'Active',
      index: true,
    },
    isReversed: { type: Boolean, default: false },
    reversedAt: { type: Date },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String, default: '' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('CustomerReceipt', customerReceiptSchema);
