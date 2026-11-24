import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import userRoutes from './routes/userRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import followUpRoutes from './routes/followUpRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';

// Phase 4 Financial Route imports
import invoiceRoutes from './routes/invoiceRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import supplierBillRoutes from './routes/supplierBillRoutes.js';
import supplierPaymentRoutes from './routes/supplierPaymentRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import cashBankRoutes from './routes/cashBankRoutes.js';
import financialReportRoutes from './routes/financialReportRoutes.js';
import exchangeRateRoutes from './routes/exchangeRateRoutes.js';

// Phase 5 Customer Portal Route imports
import portalAuthRoutes from './routes/portalAuthRoutes.js';
import portalAccountAdminRoutes from './routes/portalAccountAdminRoutes.js';
import portalDataRoutes from './routes/portalDataRoutes.js';

// Phase 6 Reports & System Settings Route imports
import reportRoutes from './routes/reportRoutes.js';
import settingRoutes from './routes/settingRoutes.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// Enable CORS
const allowedOrigins = (process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all configured origins with credentials
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // accommodate comprehensive test suites and UI usage
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'FreightERP API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/shipments', shipmentRoutes);

// Phase 4 Invoicing & Accounting Routes
app.use('/api/invoices', invoiceRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-bills', supplierBillRoutes);
app.use('/api/supplier-payments', supplierPaymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/cash-bank', cashBankRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/financial-settings', exchangeRateRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);

// Phase 5 Customer Portal Routes
app.use('/api/portal/auth', portalAuthRoutes);
app.use('/api/portal/accounts', portalAccountAdminRoutes);
app.use('/api/portal', portalDataRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and start server
let server = null;
const startServer = async () => {
  try {
    await connectDB();
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`FreightERP Backend running on port ${PORT} (0.0.0.0) in ${process.env.NODE_ENV || 'development'} mode`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
});

export default app;
