import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    expenseNumber: { type: String, required: true, unique: true, index: true },
    expenseDate: { type: Date, default: Date.now, required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    branchCode: { type: String, default: 'HQ-DXB' },
    category: { type: String, required: true, index: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD', required: true },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'Petty Cash', 'Other'],
      default: 'Cash',
    },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount' },
    vendor: { type: String, default: '' },
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
    referenceNumber: { type: String, default: '' },
    attachment: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Draft', 'Recorded', 'Void'],
      default: 'Recorded',
      index: true,
    },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Expense', expenseSchema);
