export const printViaRawBT = (orderData) => {
  // Format the receipt text
  let receiptText = "";
  const esc = '\x1B'; // ESC byte in hex notation
  const newLine = '\x0A'; // LF byte in hex notation
  const cmds = esc + "@"; // Initializes the printer (ESC @)

  // Header
  receiptText += cmds;
  receiptText += esc + 'a' + '\x01'; // Center align
  receiptText += esc + '!' + '\x18'; // Double height/width for title
  receiptText += "PIZZA SHOP\n";
  receiptText += esc + '!' + '\x00'; // Normal text
  receiptText += "Order Receipt\n";
  receiptText += "--------------------------------\n";
  
  receiptText += esc + 'a' + '\x00'; // Left align
  receiptText += `Order #: ${orderData.order_id || orderData.id || 'NEW'}\n`;
  receiptText += `Type: ${orderData.order_type}\n`;
  if (orderData.customer_name) {
    receiptText += `Customer: ${orderData.customer_name}\n`;
  }
  if (orderData.table_no) {
    receiptText += `Table: ${orderData.table_no}\n`;
  }
  receiptText += `Date: ${new Date().toLocaleString()}\n`;
  receiptText += "--------------------------------\n";

  // Items
  if (orderData.items && Array.isArray(orderData.items)) {
    orderData.items.forEach(item => {
      // Format: Qty x Item Name
      const itemName = item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name;
      receiptText += `${item.qty} x ${itemName}\n`;
      // Item price line
      if (item.selected_variations && item.selected_variations.length > 0) {
        receiptText += `   + ${item.selected_variations.map(v => v.name).join(', ')}\n`;
      }
      receiptText += `   Rs. ${item.total_price || (item.price * item.qty)}\n`;
    });
  }
  receiptText += "--------------------------------\n";

  // Totals
  receiptText += esc + 'a' + '\x02'; // Right align
  receiptText += `Subtotal: Rs. ${orderData.subtotal}\n`;
  if (orderData.tax_amount > 0) {
    receiptText += `Tax: Rs. ${orderData.tax_amount}\n`;
  }
  if (orderData.discount > 0) {
    receiptText += `Discount: Rs. ${orderData.discount}\n`;
  }
  receiptText += esc + '!' + '\x10'; // Double height for Total
  receiptText += `TOTAL: Rs. ${orderData.total_amount}\n`;
  receiptText += esc + '!' + '\x00'; // Normal text

  // Footer
  receiptText += esc + 'a' + '\x01'; // Center align
  receiptText += "\nThank you for your order!\nCome back soon\n\n\n";

  // Feed and cut
  receiptText += "\n\n\n\n\n"; // empty lines for tearing
  receiptText += esc + "i"; // partial cut

  // Encode for RawBT intent
  // RawBT accepts base64 encoded raw commands
  const encodedText = btoa(unescape(encodeURIComponent(receiptText)));
  
  // Create and trigger the intent
  // This will open RawBT instantly, print, and automatically return to the browser
  // if the user configures "Return back" in RawBT settings.
  const rawbtUrl = `intent:${encodedText}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  
  window.location.href = rawbtUrl;
};
