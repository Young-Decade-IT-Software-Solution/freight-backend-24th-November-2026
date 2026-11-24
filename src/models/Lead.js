import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    leadNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true,
    },
    leadName: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: 'United Arab Emirates',
    },
    leadSource: {
      type: String,
      enum: ['Website', 'Referral', 'Exhibition', 'Cold Call', 'Social Media', 'Other'],
      default: 'Website',
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'],
      default: 'New',
    },
    notes: {
      type: String,
      default: '',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    convertedToCustomer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    convertedAt: {
      type: Date,
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

leadSchema.pre('save', async function (next) {
  if (!this.leadName && this.contactPerson) {
    this.leadName = this.contactPerson;
  }
  if (!this.leadNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Lead').countDocuments();
    const pad = String(count + 1).padStart(4, '0');
    this.leadNumber = `LED-${year}-${pad}`;
  }
  next();
});

export default mongoose.model('Lead', leadSchema);
