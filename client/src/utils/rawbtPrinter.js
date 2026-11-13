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

export const printSalarySlipViaRawBT = (emp) => {
  if (!emp) return;
  let receiptText = "";
  const esc = '\x1B';
  const crlf = '\r\n';
  const cmds = esc + "@" + esc + "2";
  const LINE_WIDTH = 32;

  const rightAlign = (leftStr, rightStr, width = LINE_WIDTH) => {
    const left = String(leftStr || '');
    const right = String(rightStr || '');
    const space = Math.max(1, width - (left.length + right.length));
    return left + ' '.repeat(space) + right;
  };

  const baseSal = parseFloat(emp.base_salary || 0);
  const deductions = parseFloat(emp.deductions || 0);
  const payableSal = (emp.payable_salary !== undefined && emp.payable_salary !== null && emp.payable_salary !== '')
    ? parseFloat(emp.payable_salary)
    : Math.max(0, baseSal - deductions);

  const cashPaid = parseFloat(emp.cash_paid || 0);
  const bankPaid = parseFloat(emp.bank_paid || 0);
  const totalPaid = (emp.paid_amount !== undefined && emp.paid_amount !== null && parseFloat(emp.paid_amount) > 0)
    ? parseFloat(emp.paid_amount)
    : Math.round((cashPaid + bankPaid) * 100) / 100;

  const netSalary = (emp.net_salary !== undefined && emp.net_salary !== null && emp.net_salary !== '')
    ? parseFloat(emp.net_salary)
    : Math.max(0, payableSal - parseFloat(emp.this_month_adv || emp.advance_deduction || 0));

  const remaining = Math.round((netSalary - totalPaid) * 100) / 100;
  const targetMonth = emp?.month || emp?.pay_period || 'Current';

  let branchName = String(emp.branch || 'B1');
  if (branchName.toLowerCase().includes('3')) branchName = 'B3';
  else if (branchName.toLowerCase().includes('2')) branchName = 'B2';
  else branchName = 'B1';

  receiptText += cmds;
  receiptText += esc + 'a' + '\x01';
  receiptText += esc + '!' + '\x18';
  receiptText += "SALARY SLIP" + crlf;
  receiptText += esc + '!' + '\x00';
  receiptText += new Date().toLocaleString() + crlf;
  receiptText += "================================" + crlf;

  receiptText += esc + 'a' + '\x00';
  receiptText += rightAlign("Employee:", sanitizeThermalText(emp.name || emp.employee_name || 'Staff')) + crlf;
  receiptText += rightAlign("ID:", sanitizeThermalText(emp.employee_id || emp.id || 'N/A')) + crlf;
  receiptText += rightAlign("Branch:", branchName) + crlf;
  receiptText += rightAlign("Period:", targetMonth) + crlf;
  receiptText += "--------------------------------" + crlf;

  receiptText += rightAlign("Base Salary:", `SAR ${baseSal.toFixed(2)}`) + crlf;
  receiptText += rightAlign("Worked Duty:", `SAR ${payableSal.toFixed(2)}`) + crlf;
  const otPay = parseFloat(emp.overtime_pay || 0);
  if (otPay > 0) {
    receiptText += rightAlign("Overtime:", `SAR ${otPay.toFixed(2)}`) + crlf;
  }
  const bonus = parseFloat(emp.bonus || 0);
  if (bonus > 0) {
    receiptText += rightAlign("Bonus:", `SAR ${bonus.toFixed(2)}`) + crlf;
  }

  if (deductions > 0) {
    receiptText += rightAlign("Cuts/Absence:", `SAR ${deductions.toFixed(2)}`) + crlf;
  }
  const advDeduct = parseFloat(emp.this_month_adv || emp.advance_deduction || 0);
  if (advDeduct > 0) {
    receiptText += rightAlign("Advance Deduct:", `SAR ${advDeduct.toFixed(2)}`) + crlf;
  }

  receiptText += "--------------------------------" + crlf;
  receiptText += esc + '!' + '\x10';
  receiptText += rightAlign("NET PAYABLE:", `SAR ${netSalary.toFixed(2)}`) + crlf;
  receiptText += esc + '!' + '\x00';
  receiptText += "================================" + crlf;

  receiptText += rightAlign("Total Paid:", `SAR ${totalPaid.toFixed(2)}`) + crlf;
  if (cashPaid > 0) receiptText += rightAlign("Cash Paid:", `SAR ${cashPaid.toFixed(2)}`) + crlf;
  if (bankPaid > 0) receiptText += rightAlign("Bank Paid:", `SAR ${bankPaid.toFixed(2)}`) + crlf;
  receiptText += rightAlign("Remaining:", `SAR ${Math.max(0, remaining).toFixed(2)}`) + crlf;
  receiptText += rightAlign("Status:", totalPaid >= netSalary ? "PAID" : "PARTIAL") + crlf;
  receiptText += "--------------------------------" + crlf;

  receiptText += crlf + "Sign: __________________________" + crlf;
  receiptText += esc + 'a' + '\x01';
  receiptText += crlf + "Thank You" + crlf;
  receiptText += crlf + crlf + crlf;
  receiptText += esc + "i";

  const encodedText = btoa(unescape(encodeURIComponent(receiptText)));
  const rawbtUrl = `intent:${encodedText}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  window.location.href = rawbtUrl;
};
