import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      trim: true,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      default: '',
    },
    country: {
      type: String,
      default: 'United Arab Emirates',
    },
    taxNumber: {
      type: String,
      default: '',
    },
    currency: {
      type: String,
      default: 'USD',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    notes: {
      type: String,
      default: '',
    },
    convertedFromLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
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

customerSchema.pre('save', async function (next) {
  if (!this.customerCode) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Customer').countDocuments();
    const pad = String(count + 1).padStart(4, '0');
    this.customerCode = `CUST-${year}-${pad}`;
  }
  next();
});

export default mongoose.model('Customer', customerSchema);
