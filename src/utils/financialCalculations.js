/**
 * Accurate financial calculation engine avoiding JS floating-point issues
 * Uses integer cents internally for rounding
 */

export const roundMoney = (val) => {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export const toCents = (val) => {
  return Math.round((Number(val) || 0) * 100);
};

export const fromCents = (cents) => {
  return (Number(cents) || 0) / 100;
};

/**
 * Compute line items, subtotal, discount, tax, and grand total safely
 */
export const calculateFinancialTotals = ({
  lineItems = [],
  tax = 0,
  taxRate = 0,
  discount = 0,
}) => {
  let subtotalCents = 0;

  const calculatedItems = lineItems.map((item) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const itemAmountCents = Math.round(qty * price * 100);
    subtotalCents += itemAmountCents;

    return {
      description: item.description?.trim() || 'Service Item',
      quantity: qty,
      unitPrice: roundMoney(price),
      amount: fromCents(itemAmountCents),
    };
  });

  const discountCents = Math.min(toCents(discount), subtotalCents);
  const afterDiscountCents = Math.max(0, subtotalCents - discountCents);

  let taxCents = 0;
  if (taxRate > 0) {
    taxCents = Math.round(afterDiscountCents * (taxRate / 100));
  } else if (tax > 0) {
    taxCents = toCents(tax);
  }

  const grandTotalCents = afterDiscountCents + taxCents;

  return {
    lineItems: calculatedItems,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    tax: fromCents(taxCents),
    taxRate: Number(taxRate) || 0,
    totalAmount: fromCents(grandTotalCents),
  };
};
