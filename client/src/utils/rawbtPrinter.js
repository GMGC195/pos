function sanitizeThermalText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s*-\s*$/, '')
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*-+/g, '-')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Item';
}

export const printViaRawBT = (orderData) => {
  let receiptText = "";
  const esc = '\x1B';
  const gs = '\x1D';
  const crlf = '\r\n';
  const cmds = esc + "@" + esc + "2"; // Initialize + standard line spacing

  // Header
  receiptText += cmds;
  receiptText += esc + 'a' + '\x01'; // Center align
  receiptText += esc + '!' + '\x18'; // Double height/width
  receiptText += "PIZZA SHOP" + crlf;
  receiptText += esc + '!' + '\x00'; // Normal text
  receiptText += "Kitchen Slip" + crlf;
  receiptText += "--------------------------------" + crlf;
  
  receiptText += esc + 'a' + '\x00'; // Left align
  receiptText += `Order #: ${orderData.order_id || orderData.id || 'NEW'}` + crlf;
  if (orderData.order_type) {
    receiptText += `Type: ${sanitizeThermalText(orderData.order_type)}` + crlf;
  }
  if (orderData.customer_name) {
    receiptText += `Customer: ${sanitizeThermalText(orderData.customer_name)}` + crlf;
  }
  if (orderData.table_no) {
    receiptText += `Table: ${sanitizeThermalText(orderData.table_no)}` + crlf;
  }
  receiptText += `Date: ${new Date().toLocaleString()}` + crlf;
  receiptText += "--------------------------------" + crlf;

  // Items
  if (orderData.items && Array.isArray(orderData.items)) {
    orderData.items.forEach((item, idx) => {
      const cleanName = sanitizeThermalText(item.name || item.item_name || '');
      const qty = item.qty || 1;
      const unitPrice = parseFloat(item.price || item.unit_price || 0);
      const lineTotal = item.total_price || (unitPrice * qty);
      
      receiptText += `${idx + 1}. ${cleanName}` + crlf;
      receiptText += `   ${qty} x SAR ${unitPrice.toFixed(2)} = SAR ${Number(lineTotal).toFixed(2)}` + crlf;
      if (item.selected_variations && item.selected_variations.length > 0) {
        receiptText += `   + ${item.selected_variations.map(v => sanitizeThermalText(v.name)).join(', ')}` + crlf;
      }
    });
  }
  receiptText += "--------------------------------" + crlf;

  // Totals
  receiptText += esc + 'a' + '\x02'; // Right align
  receiptText += `Subtotal: SAR ${orderData.subtotal}` + crlf;
  if (orderData.tax_amount > 0) {
    receiptText += `Tax: SAR ${orderData.tax_amount}` + crlf;
  }
  if (orderData.discount > 0) {
    receiptText += `Discount: -SAR ${orderData.discount}` + crlf;
  }
  receiptText += esc + '!' + '\x10'; // Double height for Total
  receiptText += `TOTAL: SAR ${orderData.total_amount}` + crlf;
  receiptText += esc + '!' + '\x00'; // Normal text

  // Footer
  receiptText += esc + 'a' + '\x01'; // Center align
  receiptText += crlf + "Thank you for your order!" + crlf;

  // Feed and cut
  receiptText += crlf + crlf + crlf + crlf;
  receiptText += esc + "i"; // partial cut

  const encodedText = btoa(unescape(encodeURIComponent(receiptText)));
  const rawbtUrl = `intent:${encodedText}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  window.location.href = rawbtUrl;
};
