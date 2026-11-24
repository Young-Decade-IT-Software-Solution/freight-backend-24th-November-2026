import mongoose from 'mongoose';

const DEFAULT_CATEGORIES = [
  'Office Rent',
  'Salaries',
  'Utilities',
  'Internet & Telephone',
  'Marketing',
  'Travel',
  'Transportation',
  'Office Supplies',
  'Software & Subscriptions',
  'Bank Charges',
  'Professional Services',
  'Other Expenses',
];

const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export { DEFAULT_CATEGORIES };
export default mongoose.model('ExpenseCategory', expenseCategorySchema);
