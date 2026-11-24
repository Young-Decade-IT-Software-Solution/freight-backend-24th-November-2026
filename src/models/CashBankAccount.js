import mongoose from 'mongoose';

const cashBankAccountSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    accountType: {
      type: String,
      enum: ['Cash', 'Bank', 'Petty Cash'],
      default: 'Bank',
      required: true,
    },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    accountReference: { type: String, default: '', trim: true },
    currency: { type: String, default: 'USD', required: true },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: { type: Date, default: Date.now },
    currentBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('CashBankAccount', cashBankAccountSchema);
