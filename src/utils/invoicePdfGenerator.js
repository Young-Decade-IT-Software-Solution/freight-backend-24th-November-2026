import PDFDocument from 'pdfkit';

/**
 * Generate a professional, commercial Freight Invoice PDF
 */
export const generateInvoicePdfBuffer = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const branch = invoice.branch || {};
      const customer = invoice.customer || {};
      const shipment = invoice.shipment || {};

      // Colors
      const navy = '#0F172A';
      const teal = '#0D9488';
      const slate = '#64748B';
      const lightBg = '#F8FAFC';
      const borderCol = '#E2E8F0';

      // Header Banner
      doc.rect(40, 40, 515, 65).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('FreightERP', 55, 52);
      doc.fontSize(8).font('Helvetica').fillColor(teal).text('GLOBAL FREIGHT FORWARDING & LOGISTICS', 55, 78);

      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold').text('COMMERCIAL INVOICE', 350, 52, { align: 'right', width: 190 });
      doc.fontSize(9).font('Helvetica').fillColor('#94A3B8').text(invoice.invoiceNumber, 350, 74, { align: 'right', width: 190 });

      // Meta Information Grid
      doc.fillColor(navy);
      const topY = 120;

      // Left Column: Branch & Billing Details
      doc.fontSize(9).font('Helvetica-Bold').fillColor(teal).text('ISSUED BY:', 45, topY);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text(branch.name || 'Head Office Hub', 45, topY + 14);
      doc.fontSize(8).font('Helvetica').fillColor(slate);
      doc.text(branch.address || 'Port Rashid Business Tower, Dubai', 45, topY + 28);
      doc.text(`${branch.city || 'Dubai'}, ${branch.country || 'UAE'}`, 45, topY + 40);
      doc.text(`Phone: ${branch.phone || '+971 4 398 2211'} | Email: ${branch.email || 'billing@freighterp.com'}`, 45, topY + 52);

      // Right Column: Invoice Specs
      doc.fontSize(9).font('Helvetica-Bold').fillColor(teal).text('INVOICE DETAILS:', 360, topY);
      doc.fontSize(8).font('Helvetica').fillColor(slate);
      doc.text(`Invoice Date: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : 'N/A'}`, 360, topY + 14);
      doc.text(`Payment Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}`, 360, topY + 26);
      doc.text(`Payment Terms: ${invoice.paymentTerms || 'Net 30 Days'}`, 360, topY + 38);
      doc.text(`Currency: ${invoice.currency}`, 360, topY + 50);
      doc.text(`Status: ${invoice.status.toUpperCase()}`, 360, topY + 62);

      // Customer / Billed To Section
      const billY = 205;
      doc.rect(40, billY, 515, 60).fill(lightBg).stroke(borderCol);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(teal).text('BILLED TO (CONSIGNEE / CLIENT):', 50, billY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text(customer.companyName || customer.contactPerson || 'Customer Account', 50, billY + 22);
      doc.fontSize(8).font('Helvetica').fillColor(slate);
      doc.text(`Contact: ${customer.contactPerson || 'N/A'} | Email: ${customer.email || 'N/A'}`, 50, billY + 35);
      doc.text(`Address: ${invoice.customerBillingAddress || customer.address || customer.country || 'N/A'} | Tax / VAT: ${invoice.customerTaxNumber || customer.taxNumber || 'N/A'}`, 50, billY + 46);

      // Shipment & Cargo Banner
      let tableY = 275;
      if (shipment.shipmentNumber) {
        doc.rect(40, tableY, 515, 30).fill('#F0FDFA').stroke('#CCFBF1');
        doc.fontSize(8).font('Helvetica-Bold').fillColor(teal).text('SHIPMENT REFERENCE:', 50, tableY + 6);
        doc.font('Helvetica').fillColor(navy).text(
          `${shipment.shipmentNumber} | Mode: ${shipment.freightType || 'General'} | Route: ${shipment.origin || ''} → ${shipment.destination || ''}`,
          50,
          tableY + 17
        );
        tableY += 40;
      }

      // Line Items Table Header
      doc.rect(40, tableY, 515, 20).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('#', 48, tableY + 6);
      doc.text('DESCRIPTION / FREIGHT CHARGES', 75, tableY + 6);
      doc.text('QTY', 360, tableY + 6, { align: 'center', width: 40 });
      doc.text('UNIT PRICE', 410, tableY + 6, { align: 'right', width: 60 });
      doc.text('TOTAL', 480, tableY + 6, { align: 'right', width: 65 });

      let currentY = tableY + 20;
      const items = invoice.lineItems || [];

      items.forEach((item, index) => {
        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(40, currentY, 515, 20).fill('#FAFAFA');
        }

        doc.fillColor(navy).fontSize(8).font('Helvetica');
        doc.text(String(index + 1), 48, currentY + 6);
        doc.text(item.description, 75, currentY + 6, { width: 280, ellipsis: true });
        doc.text(String(item.quantity), 360, currentY + 6, { align: 'center', width: 40 });
        doc.text(`${invoice.currency} ${item.unitPrice.toFixed(2)}`, 410, currentY + 6, { align: 'right', width: 60 });
        doc.font('Helvetica-Bold').text(`${invoice.currency} ${item.amount.toFixed(2)}`, 480, currentY + 6, { align: 'right', width: 65 });

        currentY += 20;
      });

      doc.rect(40, tableY, 515, currentY - tableY).stroke(borderCol);

      // Financial Calculation Summary Box (Right aligned)
      currentY += 15;
      const summaryX = 330;
      const summaryWidth = 225;

      doc.fontSize(8).font('Helvetica').fillColor(slate);
      doc.text('Subtotal:', summaryX, currentY);
      doc.text(`${invoice.currency} ${invoice.subtotal.toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 120 });
      currentY += 14;

      if (invoice.discount > 0) {
        doc.text('Discount:', summaryX, currentY);
        doc.text(`- ${invoice.currency} ${invoice.discount.toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 120 });
        currentY += 14;
      }

      if (invoice.tax > 0) {
        doc.text(`Tax (${invoice.taxRate || 0}%):`, summaryX, currentY);
        doc.text(`${invoice.currency} ${invoice.tax.toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 120 });
        currentY += 14;
      }

      doc.rect(summaryX - 10, currentY - 2, summaryWidth, 24).fill(teal);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('TOTAL AMOUNT:', summaryX, currentY + 6);
      doc.text(`${invoice.currency} ${invoice.totalAmount.toFixed(2)}`, summaryX + 90, currentY + 6, { align: 'right', width: 130 });
      currentY += 30;

      // Paid & Balance Box
      doc.fontSize(8).font('Helvetica-Bold').fillColor(slate);
      doc.text('Amount Paid:', summaryX, currentY);
      doc.fillColor('#059669').text(`${invoice.currency} ${(invoice.paidAmount || 0).toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 120 });
      currentY += 14;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(navy);
      doc.text('Outstanding Balance:', summaryX, currentY);
      doc.fillColor(invoice.balanceAmount > 0 ? '#DC2626' : '#059669').text(
        `${invoice.currency} ${(invoice.balanceAmount || 0).toFixed(2)}`,
        summaryX + 100,
        currentY,
        { align: 'right', width: 120 }
      );

      // Payment Instructions & Notes (Left Side)
      const notesY = currentY - 45;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(navy).text('PAYMENT INSTRUCTIONS:', 45, notesY);
      doc.fontSize(7.5).font('Helvetica').fillColor(slate);
      doc.text(`Beneficiary: FreightERP Logistics LLC (${branch.name || 'HQ'})`, 45, notesY + 12);
      doc.text(`Bank: First Abu Dhabi Bank / Emirates NBD`, 45, notesY + 22);
      doc.text(`IBAN: AE070331234567890123456 | Swift: FABUAEAA`, 45, notesY + 32);
      doc.text(`Please quote invoice ${invoice.invoiceNumber} as payment reference.`, 45, notesY + 42);

      // Footer
      doc.rect(40, 770, 515, 0.5).fill(borderCol);
      doc.fontSize(7).font('Helvetica').fillColor(slate).text(
        `FreightERP Commercial System — Branch: ${branch.name || 'HQ'} | Certified Official Document | Page 1 of 1`,
        40,
        780,
        { align: 'center', width: 515 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
