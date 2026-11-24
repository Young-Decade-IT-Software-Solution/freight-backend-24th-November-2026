import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    // Company Information
    companyName: {
      type: String,
      default: 'FreightERP Global Logistics LLC',
      trim: true,
    },
    logoUrl: {
      type: String,
      default: '',
    },
    companyAddress: {
      type: String,
      default: 'Level 14, Boulevard Plaza Tower 1, Downtown Dubai, United Arab Emirates',
    },
    companyEmail: {
      type: String,
      default: 'contact@freighterp.com',
      trim: true,
      lowercase: true,
    },
    companyPhone: {
      type: String,
      default: '+971 4 398 2211',
    },
    companyWebsite: {
      type: String,
      default: 'https://www.freighterp.com',
    },
    taxNumber: {
      type: String,
      default: 'TRN-100293847500003',
    },
    defaultCurrency: {
      type: String,
      default: 'USD',
    },
    timezone: {
      type: String,
      default: 'Asia/Dubai',
    },
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD',
    },

    // Freight & Operations Settings
    freightModes: {
      type: [String],
      default: [
        'Sea Freight FCL',
        'Sea Freight LCL',
        'Air Freight',
        'Road Freight',
        'Rail Freight',
        'Multimodal Freight',
        'Courier / Express',
      ],
    },
    defaultMilestones: {
      type: [String],
      default: [
        'Booking Confirmed',
        'Cargo Received',
        'Origin Customs Completed',
        'Departed Origin',
        'Arrived at Destination',
        'Destination Customs Completed',
        'Out for Delivery',
        'Delivered',
      ],
    },
    documentCategories: {
      type: [String],
      default: [
        'Commercial Invoice',
        'Packing List',
        'Bill of Lading',
        'Air Waybill',
        'Delivery Order',
        'Customs Documents',
        'Certificate of Origin',
        'Insurance Documents',
        'Other Documents',
      ],
    },
    defaultCustomerVisible: {
      type: Boolean,
      default: false,
    },

    // Financial & Invoicing Settings
    supportedCurrencies: {
      type: [String],
      default: ['USD', 'EUR', 'AED', 'TRY', 'CNY', 'GBP', 'SGD'],
    },
    invoicePaymentTerms: {
      type: [String],
      default: ['Immediate', 'Net 15 Days', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days'],
    },
    defaultTaxRate: {
      type: Number,
      default: 5.0,
    },
    invoicePrefix: {
      type: String,
      default: 'INV',
    },

    // SMTP Email Configuration (Password masked for security)
    smtpHost: {
      type: String,
      default: 'smtp.ethereal.email',
    },
    smtpPort: {
      type: Number,
      default: 587,
    },
    smtpUser: {
      type: String,
      default: '',
    },
    smtpPass: {
      type: String,
      default: '',
      select: false,
    },
    smtpFrom: {
      type: String,
      default: 'FreightERP Operations <ops@freighterp.com>',
    },
    isEmailConfigured: {
      type: Boolean,
      default: false,
    },

    // Storage Abstraction (Local vs S3-compatible)
    storageProvider: {
      type: String,
      enum: ['local', 's3'],
      default: 'local',
    },
    s3Bucket: {
      type: String,
      default: '',
    },
    s3Region: {
      type: String,
      default: 'us-east-1',
    },
    s3Endpoint: {
      type: String,
      default: '',
    },
    s3AccessKey: {
      type: String,
      default: '',
    },
    s3SecretKey: {
      type: String,
      default: '',
      select: false,
    },
  },
  { timestamps: true }
);

// Helper static to get or initialize settings singleton
systemSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model('SystemSetting', systemSettingSchema);
