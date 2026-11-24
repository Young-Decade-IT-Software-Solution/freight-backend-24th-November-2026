# FreightERP — Backend API

> **Global Freight Forwarding & Logistics Management ERP — Backend Application**  
> Built with Node.js (ES Modules), Express.js, MongoDB Atlas (Mongoose ODM), PDFKit, and Nodemailer.

---

## 1. Overview

FreightERP Backend powers a multi-branch freight management platform operating across 5 international hubs:
- **Dubai Headquarters (UAE)** — Primary corporate governance & operations hub.
- **Rotterdam Port (Netherlands)** — European maritime & ocean freight hub.
- **Singapore Changi (Singapore)** — Southeast Asia air & multimodal transit hub.
- **Shanghai Hub (China)** — East Asia manufacturing & export gateway.
- **Istanbul Gateway (Turkey)** — Eurasia transshipment & overland gateway.

The platform provides end-to-end management from **CRM Leads $\rightarrow$ Customers $\rightarrow$ Quotations $\rightarrow$ Customer Self-Service Portal $\rightarrow$ Freight & Milestones $\rightarrow$ Invoices $\rightarrow$ Receipts $\rightarrow$ Ledger Analytics**.

---

## 2. Technology Stack

- **Runtime:** Node.js (>= 18.0.0, ES Modules `"type": "module"`)
- **Web Framework:** Express.js 4.x
- **Database:** MongoDB Atlas / Replica Set via Mongoose 8.x ODM
- **Authentication:** Dual-Secret Stateless JWT Architecture (Internal ERP + Customer Portal)
- **Document Generation:** PDFKit streaming document builder
- **Mail Service:** Nodemailer with diagnostic test modal
- **Security:** Helmet, CORS, Express-Rate-Limit, BCryptJS password hashing

---

## 3. Project Structure

```
backend/
├── src/
│   ├── config/             # Database connection & configurations
│   ├── controllers/        # Express route controllers (Auth, CRM, Quotes, Shipments, Invoices, Reports, Settings, Portal)
│   ├── middleware/         # JWT Auth, Role-Based Access Control (RBAC), Error Handling
│   ├── models/             # Mongoose schemas (User, Branch, Customer, Lead, Quotation, Shipment, Invoice, Receipt, etc.)
│   ├── routes/             # Express API route modules
│   ├── seed/               # Database seeder scripts for branches, users, and operational master data
│   ├── utils/              # PDF generators, sequence generators, financial calculation engine
│   └── server.js           # Server entry point & middleware bindings
├── .env.example            # Environment configuration template
├── .gitignore              # Production git exclusion rules
├── package.json            # Node.js dependencies & scripts
└── README.md               # Backend documentation
```

---

## 4. Setup & Local Development

### Prerequisites
- Node.js >= 18.x
- MongoDB Atlas account or local MongoDB instance

### Installation Steps

1. **Clone repository and install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your MongoDB connection string and JWT secrets.

3. **Seed Initial Database Records:**
   ```bash
   npm run seed
   ```
   This populates the 5 global branches, 15 staff users (all 5 roles), and initial master data.

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   npm start
   ```

5. **Verify Server Health:**
   ```bash
   curl http://localhost:5000/api/health
   ```
   Expected response:
   ```json
   {
     "status": "online",
     "app": "FreightERP API",
     "version": "1.0.0",
     "timestamp": "2026-11-24T..."
   }
   ```

---

## 5. Environment Variables Specification

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Listening port for Express HTTP server | `5000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `production` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `https://your-frontend.onrender.com` |
| `MONGODB_URI` | MongoDB Atlas cluster connection URI | `mongodb+srv://<user>:<pass>@cluster0.mongodb.net/freighterp` |
| `JWT_SECRET` | Secret key for internal staff JWT tokens | `min_32_characters_random_string` |
| `JWT_EXPIRES_IN` | Validity duration of internal JWT | `7d` |
| `PORTAL_JWT_SECRET` | Distinct secret for customer portal tokens | `min_32_characters_random_string` |
| `PORTAL_JWT_EXPIRES_IN` | Validity duration of customer portal JWT | `7d` |
| `SMTP_HOST` | Outbound transactional mail server host | `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port (typically 587 or 465) | `587` |
| `SMTP_USER` | SMTP username or API key | `apikey` |
| `SMTP_PASS` | SMTP password or secret | `********` |
| `SMTP_FROM` | Default sender header for notifications | `"FreightERP Dispatch" <dispatch@freighterp.com>` |
| `STORAGE_PROVIDER` | Document storage adapter (`local` or `s3`) | `local` |
| `AWS_S3_BUCKET` | S3 bucket name (when `STORAGE_PROVIDER=s3`) | `freighterp-documents` |

---

## 6. Document Storage Architecture

- **Local Storage:** Files uploaded to `uploads/` directory. For Docker / container hosting, ensure a persistent volume is mounted to `uploads/`.
- **Cloud Object Storage (S3):** Supported natively via configuration in `/settings` (Company Settings Console), storing shipping documents and invoices in AWS S3 or Cloudflare R2.

---

## 7. Production Deployment (e.g. Render)

1. Connect the repository to **Render Web Service**.
2. Set **Environment**: `Node`.
3. Set **Build Command**: `npm install`.
4. Set **Start Command**: `npm start`.
5. Add required environment variables (`MONGODB_URI`, `JWT_SECRET`, `PORTAL_JWT_SECRET`, `CLIENT_URL`).
6. Set health check path to `/api/health`.
