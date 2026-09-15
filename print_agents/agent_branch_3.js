const Pusher = require('pusher-js');
const net = require('net');

// ================= PUSHER CONFIGURATION =================
const PUSHER_KEY = '02c0db2b9c0352bea4fc';
const PUSHER_CLUSTER = 'ap2';
const BRANCH_ID = '3';
const CHANNEL_NAME = `branch-${BRANCH_ID}-orders`;

const pusher = new Pusher(PUSHER_KEY, {
  cluster: PUSHER_CLUSTER,
  forceTLS: true,
});

console.log('====================================================');
console.log(`[OK] POS Print Agent active for BRANCH ${BRANCH_ID}`);
console.log(`Subscribed to: ${CHANNEL_NAME}`);
console.log('====================================================\n');

pusher.connection.bind('connected', () => {
  console.log('[STATUS] Connected to Pusher Cloud successfully!');
});

pusher.connection.bind('error', (err) => {
  console.error('[ERROR] Pusher Connection Error:', err);
});

const channel = pusher.subscribe(CHANNEL_NAME);

// Standard Kitchen Ticket Event
channel.bind('print-kitchen-ticket', (data) => {
  console.log(`\n[TICKET RECEIVED] Branch ${BRANCH_ID} Order #${data.orderNumber || data.orderId || 'N/A'}`);
  dispatchPrint(data);
});

// Fallback Generic Event
channel.bind('new-order', (data) => {
  console.log(`\n[ORDER RECEIVED] Branch ${BRANCH_ID} Order #${data.orderNumber || data.orderId || 'N/A'}`);
  dispatchPrint(data);
});

// ================= PRINT DISPATCH LOGIC =================
function dispatchPrint(data) {
  const targetIp = data.printerIp || '127.0.0.1';
  const targetPort = 9100;
  const socket = new net.Socket();

  socket.setTimeout(4000);

  socket.connect(targetPort, targetIp, () => {
    console.log(`Dispatching ticket to printer at ${targetIp}:${targetPort}...`);

    // Standard ESC/POS Commands
    const ESC = '\x1B';
    const GS = '\x1D';
    const INIT = ESC + '@';
    const BOLD_ON = ESC + 'E' + '\x01';
    const BOLD_OFF = ESC + 'E' + '\x00';
    const CENTER = ESC + 'a' + '\x01';
    const LEFT = ESC + 'a' + '\x00';
    const TEXT_NORMAL = GS + '!' + '\x00';
    const TEXT_DOUBLE = GS + '!' + '\x11';
    const CUT = GS + 'V' + '\x41' + '\x03';

    // 80mm Full Width without extra margin
    const LINE_WIDTH = 42; 

    const pad = (str, len) => ((str || '') + ' '.repeat(len)).slice(0, len);
    const rightAlign = (leftStr, rightStr, width = LINE_WIDTH) => {
      const space = Math.max(1, width - (String(leftStr).length + String(rightStr).length));
      return leftStr + ' '.repeat(space) + rightStr;
    };

    let ticket = INIT;

    // 1. Header: Branch & Order Type (Dynamic)
    const branchPart = data.branchId ? `B${data.branchId}` : `B${BRANCH_ID}`;
    const orderTypePart = data.orderType || '';
    let headerTitle = '';

    if (branchPart && orderTypePart) {
      headerTitle = `${branchPart} - ${orderTypePart}`;
    } else {
      headerTitle = branchPart || orderTypePart;
    }

    if (headerTitle) {
      ticket += CENTER + BOLD_ON + TEXT_DOUBLE + `${headerTitle}\n` + TEXT_NORMAL + BOLD_OFF;
    }

    // 2. Kitchen Notice
    ticket += '\nKitchen slip. Please get original slip from\ncounter.\n\n';

    // 3. Table & Waiter (Dynamic)
    const metaParts = [];
    if (data.tableName) metaParts.push(data.tableName);
    if (data.waiterName) metaParts.push(`By: ${data.waiterName}`);
    if (metaParts.length > 0) {
      ticket += BOLD_ON + `${metaParts.join(' | ')}\n` + BOLD_OFF;
    }

    // 4. Customer Info (Only if present)
    if (data.customerName || data.customerPhone || data.phone) {
      const custName = data.customerName || '';
      const custPhone = data.customerPhone || data.phone || '';
      const customerText = [custName, custPhone].filter(Boolean).join(' - ');
      ticket += `Cust: ${customerText}\n`;
    }

    // 5. Order Number
    const orderNumberStr = data.orderNumber ? ` - ${data.orderNumber}` : '';
    if (data.orderId || data.orderNumber) {
      ticket += BOLD_ON + TEXT_DOUBLE + `Order #${data.orderId || ''}${orderNumberStr}\n` + TEXT_NORMAL + BOLD_OFF;
    }

    // 6. Date & Time
    const orderDate = data.createdAt
      ? new Date(data.createdAt).toLocaleString('en-US')
      : new Date().toLocaleString('en-US');
    ticket += `${orderDate}\n`;

    // 7. Items Table
    ticket += LEFT;
    ticket += '-'.repeat(LINE_WIDTH) + '\n';
    ticket += pad('Item', 24) + pad('QTY', 6) + pad('Amount', 12).padStart(12, ' ') + '\n';
    ticket += '-'.repeat(LINE_WIDTH) + '\n';

    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item, index) => {
      let itemName = item.name || '';
      const itemTitle = `${index + 1}. ${itemName}`;
      const qtyStr = String(item.qty || item.quantity || 1);
      const amountStr = `${data.currency || 'SAR'} ${Number(item.amount || 0).toFixed(2)}`;
      
      if(itemTitle.length > 24) {
        ticket += itemTitle + '\n';
        ticket += pad('', 24) + pad(qtyStr, 6) + amountStr.padStart(12, ' ') + '\n';
      } else {
        ticket += pad(itemTitle, 24) + pad(qtyStr, 6) + amountStr.padStart(12, ' ') + '\n';
      }
    });

    // 8. Totals Section
    ticket += '-'.repeat(LINE_WIDTH) + '\n';
    ticket += rightAlign('Total Items', String(data.totalItems || items.length)) + '\n';

    if (data.subtotal !== undefined && data.subtotal !== null) {
      ticket += rightAlign('Subtotal', `${data.currency || 'SAR'} ${Number(data.subtotal).toFixed(2)}`) + '\n';
    }

    // Discount (Prints only if > 0)
    const discountVal = Number(data.discount || data.discountAmount || 0);
    if (discountVal > 0) {
      ticket += rightAlign('Discount', `-${data.currency || 'SAR'} ${discountVal.toFixed(2)}`) + '\n';
    }

    // TOTAL (Double Line + Bold)
    ticket += '='.repeat(LINE_WIDTH) + '\n';
    ticket += BOLD_ON + TEXT_DOUBLE + rightAlign('TOTAL', `${data.currency || 'SAR'} ${Number(data.total || 0).toFixed(2)}`, 21) + TEXT_NORMAL + BOLD_OFF + '\n';
    ticket += '='.repeat(LINE_WIDTH) + '\n';

    // Payment Status (Dynamic)
    if (data.paymentStatus) {
      ticket += rightAlign('Payment', data.paymentStatus) + '\n';
    }

    // Paper Cut
    ticket += '\n\n\n\n' + CUT;

    socket.write(ticket, 'utf-8', () => {
      socket.end();
      console.log(`[SUCCESS] Slip printed for Order #${data.orderNumber || data.orderId}\n`);
    });
  });

  socket.on('error', (err) => {
    console.error(`[SOCKET ERROR on ${targetIp}]:`, err.message);
  });

  socket.on('timeout', () => {
    console.error(`[SOCKET TIMEOUT] Printer unreachable at ${targetIp}`);
    socket.destroy();
  });
}

// Background Protections
process.on('uncaughtException', (err) => {
  console.error('[CRASH PREVENTED]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});
