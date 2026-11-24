import nodemailer from 'nodemailer';
import SystemSetting from '../models/SystemSetting.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import Shipment from '../models/Shipment.js';
import Invoice from '../models/Invoice.js';
import Activity from '../models/Activity.js';

// @desc    Get All System Settings
// @route   GET /api/settings
// @access  Private (Super Admin, Branch Admin)
export const getSystemSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();

    // Prepare response with masked secrets
    const data = {
      _id: settings._id,
      companyName: settings.companyName,
      logoUrl: settings.logoUrl,
      companyAddress: settings.companyAddress,
      companyEmail: settings.companyEmail,
      companyPhone: settings.companyPhone,
      companyWebsite: settings.companyWebsite,
      taxNumber: settings.taxNumber,
      defaultCurrency: settings.defaultCurrency,
      timezone: settings.timezone,
      dateFormat: settings.dateFormat,

      // Freight
      freightModes: settings.freightModes,
      defaultMilestones: settings.defaultMilestones,
      documentCategories: settings.documentCategories,
      defaultCustomerVisible: settings.defaultCustomerVisible,

      // Financial
      supportedCurrencies: settings.supportedCurrencies,
      invoicePaymentTerms: settings.invoicePaymentTerms,
      defaultTaxRate: settings.defaultTaxRate,
      invoicePrefix: settings.invoicePrefix,

      // Email (password masked)
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      smtpFrom: settings.smtpFrom,
      isEmailConfigured: settings.isEmailConfigured,

      // Storage
      storageProvider: settings.storageProvider,
      s3Bucket: settings.s3Bucket,
      s3Region: settings.s3Region,
      s3Endpoint: settings.s3Endpoint,
      s3AccessKey: settings.s3AccessKey ? `${settings.s3AccessKey.slice(0, 4)}••••` : '',
    };

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Company Information
// @route   PUT /api/settings/company
// @access  Private (Super Admin only)
export const updateCompanySettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();
    const allowed = [
      'companyName',
      'logoUrl',
      'companyAddress',
      'companyEmail',
      'companyPhone',
      'companyWebsite',
      'taxNumber',
      'defaultCurrency',
      'timezone',
      'dateFormat',
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();

    await Activity.create({
      action: 'Company Settings Updated',
      module: 'Branch',
      details: `Updated enterprise company details by ${req.user.name}`,
      user: req.user._id,
      userName: req.user.name,
      branch: req.user.branch?._id || req.user.branch,
    });

    res.json({
      success: true,
      message: 'Company settings updated successfully',
      data: settings,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Freight & Operational Preferences
// @route   PUT /api/settings/freight
// @access  Private (Super Admin only)
export const updateFreightSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();

    if (Array.isArray(req.body.freightModes) && req.body.freightModes.length > 0) {
      settings.freightModes = req.body.freightModes;
    }
    if (Array.isArray(req.body.defaultMilestones) && req.body.defaultMilestones.length > 0) {
      settings.defaultMilestones = req.body.defaultMilestones;
    }
    if (Array.isArray(req.body.documentCategories) && req.body.documentCategories.length > 0) {
      settings.documentCategories = req.body.documentCategories;
    }
    if (req.body.defaultCustomerVisible !== undefined) {
      settings.defaultCustomerVisible = Boolean(req.body.defaultCustomerVisible);
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Freight and operational preferences saved',
      data: settings,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Financial Settings
// @route   PUT /api/settings/financial
// @access  Private (Super Admin only)
export const updateFinancialSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();

    if (Array.isArray(req.body.supportedCurrencies)) {
      settings.supportedCurrencies = req.body.supportedCurrencies;
    }
    if (Array.isArray(req.body.invoicePaymentTerms)) {
      settings.invoicePaymentTerms = req.body.invoicePaymentTerms;
    }
    if (req.body.defaultTaxRate !== undefined) {
      settings.defaultTaxRate = Number(req.body.defaultTaxRate);
    }
    if (req.body.invoicePrefix) {
      settings.invoicePrefix = req.body.invoicePrefix.trim();
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Financial preferences saved successfully',
      data: settings,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Email Configuration & Credentials
// @route   PUT /api/settings/email
// @access  Private (Super Admin only)
export const updateEmailSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = req.body;

    if (smtpHost) settings.smtpHost = smtpHost.trim();
    if (smtpPort) settings.smtpPort = Number(smtpPort);
    if (smtpUser !== undefined) settings.smtpUser = smtpUser.trim();
    if (smtpPass) settings.smtpPass = smtpPass;
    if (smtpFrom) settings.smtpFrom = smtpFrom.trim();

    settings.isEmailConfigured = Boolean(settings.smtpHost && settings.smtpUser);
    await settings.save();

    res.json({
      success: true,
      message: 'Email configuration updated securely',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Test SMTP Email Delivery
// @route   POST /api/settings/email/test
// @access  Private (Super Admin only)
export const testEmailDelivery = async (req, res, next) => {
  try {
    const { recipient } = req.body;
    const testRecipient = recipient || req.user.email;

    const settings = await SystemSetting.findOne().select('+smtpPass');

    const host = settings?.smtpHost || process.env.SMTP_HOST || 'smtp.ethereal.email';
    const port = settings?.smtpPort || Number(process.env.SMTP_PORT) || 587;
    const user = settings?.smtpUser || process.env.SMTP_USER;
    const pass = settings?.smtpPass || process.env.SMTP_PASS;

    // Create transporter
    let transporter;
    if (user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      // Create test account fallback
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    // Verify SMTP connection
    await transporter.verify();

    // Send test email
    const info = await transporter.sendMail({
      from: settings?.smtpFrom || 'FreightERP Support <support@freighterp.com>',
      to: testRecipient,
      subject: 'FreightERP — SMTP Configuration Test Verification',
      text: `This is an automated test message from FreightERP. SMTP configuration is verified and fully functional.\nServer: ${host}:${port}\nTimestamp: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">FreightERP Mail Service Verified</h2>
          <p style="color: #475569;">Your SMTP server connection test succeeded.</p>
          <ul style="color: #334155;">
            <li><strong>SMTP Host:</strong> ${host}</li>
            <li><strong>SMTP Port:</strong> ${port}</li>
            <li><strong>Delivered To:</strong> ${testRecipient}</li>
            <li><strong>Timestamp:</strong> ${new Date().toLocaleString()}</li>
          </ul>
        </div>
      `,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    res.json({
      success: true,
      message: `Test email successfully dispatched to ${testRecipient}`,
      messageId: info.messageId,
      previewUrl: previewUrl || null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `SMTP Connection Failed: ${err.message}`,
    });
  }
};

// @desc    Update Storage Configuration (Local vs S3)
// @route   PUT /api/settings/storage
// @access  Private (Super Admin only)
export const updateStorageSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.getSettings();
    const { storageProvider, s3Bucket, s3Region, s3Endpoint, s3AccessKey, s3SecretKey } = req.body;

    if (storageProvider && ['local', 's3'].includes(storageProvider)) {
      settings.storageProvider = storageProvider;
    }
    if (s3Bucket !== undefined) settings.s3Bucket = s3Bucket.trim();
    if (s3Region !== undefined) settings.s3Region = s3Region.trim();
    if (s3Endpoint !== undefined) settings.s3Endpoint = s3Endpoint.trim();
    if (s3AccessKey !== undefined) settings.s3AccessKey = s3AccessKey.trim();
    if (s3SecretKey) settings.s3SecretKey = s3SecretKey.trim();

    await settings.save();

    res.json({
      success: true,
      message: 'Storage configuration preferences updated successfully',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get All Branches with Record Counts
// @route   GET /api/settings/branches
// @access  Private (Super Admin, Branch Admin)
export const getBranchSettings = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'Super Admin') {
      filter._id = req.user.branch?._id || req.user.branch;
    }

    const branches = await Branch.find(filter).sort({ isHeadOffice: -1, name: 1 });

    const enriched = await Promise.all(
      branches.map(async (b) => {
        const [usersCount, shipmentsCount, invoicesCount] = await Promise.all([
          User.countDocuments({ branch: b._id }),
          Shipment.countDocuments({ branch: b._id }),
          Invoice.countDocuments({ branch: b._id }),
        ]);

        return {
          ...b.toObject(),
          usersCount,
          shipmentsCount,
          invoicesCount,
          hasRecords: usersCount > 0 || shipmentsCount > 0 || invoicesCount > 0,
        };
      })
    );

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Branch Details & Settings
// @route   PUT /api/settings/branches/:id
// @access  Private (Super Admin, Branch Admin for assigned branch)
export const updateBranchSettings = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    if (req.user.role !== 'Super Admin') {
      const userBranchId = req.user.branch?._id?.toString() || req.user.branch?.toString();
      if (userBranchId !== branch._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied: You can only edit your assigned branch' });
      }
    }

    const { name, phone, email, address, city, country, currency, timezone } = req.body;
    if (name) branch.name = name.trim();
    if (phone) branch.phone = phone.trim();
    if (email) branch.email = email.trim();
    if (address) branch.address = address.trim();
    if (city) branch.city = city.trim();
    if (country) branch.country = country.trim();
    if (currency) branch.currency = currency.trim();
    if (timezone) branch.timezone = timezone.trim();

    await branch.save();

    res.json({
      success: true,
      message: 'Branch preferences updated successfully',
      data: branch,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle Branch Active / Inactive
// @route   PUT /api/settings/branches/:id/toggle
// @access  Private (Super Admin only)
export const toggleBranchStatus = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    if (branch.isHeadOffice) {
      return res.status(400).json({
        success: false,
        message: 'Head Office branch cannot be deactivated',
      });
    }

    branch.isActive = !branch.isActive;
    await branch.save();

    res.json({
      success: true,
      message: `Branch ${branch.name} is now ${branch.isActive ? 'Active' : 'Inactive'}`,
      data: branch,
    });
  } catch (err) {
    next(err);
  }
};
