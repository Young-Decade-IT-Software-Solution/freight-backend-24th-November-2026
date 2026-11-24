import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      required: true,
      enum: [
        'Auth',
        'Branch',
        'User',
        'Lead',
        'Customer',
        'Quotation',
        'Shipment',
        'Invoice',
        'Payment',
        'Accounting',
        'Expense',
        'Supplier',
        'Receipt',
        'Portal',
      ],
    },
    details: {
      type: String,
      default: '',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    customerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerUser',
      required: false,
    },
    userName: {
      type: String,
      default: '',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Activity', activitySchema);
