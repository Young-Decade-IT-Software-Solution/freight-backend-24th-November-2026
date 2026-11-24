import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    supplierCode: { type: String, required: true, unique: true, index: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    address: { type: String, default: '' },
    country: { type: String, default: 'Global' },
    taxNumber: { type: String, default: '' },
    supplierType: {
      type: String,
      enum: ['Shipping Line', 'Airline', 'Transport Company', 'Customs Agent', 'Freight Agent', 'Warehouse', 'Other Service Provider'],
      default: 'Shipping Line',
    },
    preferredCurrency: { type: String, default: 'USD' },
    paymentTerms: { type: String, default: 'Net 30 Days' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
