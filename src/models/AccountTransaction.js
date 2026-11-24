import mongoose from 'mongoose';

const accountTransactionSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    transactionNumber: { type: String, required: true },
    transactionDate: { type: Date, default: Date.now, required: true, index: true },
    transactionType: {
      type: String,
      enum: [
        'Customer Receipt',
        'Customer Receipt Reversal',
        'Supplier Payment',
        'Supplier Payment Reversal',
        'Expense',
        'Expense Void',
        'Adjustment',
        'Opening Balance',
      ],
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    debit: { type: Number, default: 0 }, // Outflow / Decrease
    credit: { type: Number, default: 0 }, // Inflow / Increase
    balance: { type: Number, required: true }, // Resulting balance
    currency: { type: String, default: 'USD', required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    referenceType: { type: String, default: '' },
    referenceNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('AccountTransaction', accountTransactionSchema);
