const Pusher = require('pusher-js');
const net = require('net');
const fs = require('fs');
const path = require('path');

// ================= CONFIGURATION =================
let config = {
  branchId: '1',
  printerIp: '127.0.0.1',
  printerPort: 9100,
  pusherKey: '02c0db2b9c0352bea4fc',
  pusherCluster: 'ap2',
};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const fileConf = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...fileConf };
  } catch (err) {
    console.error('[CONFIG ERROR] Failed to parse config.json:', err.message);
  }
}

// Allow CLI override: node agent.js 2 (for branch 2)
if (process.argv[2]) {
  config.branchId = String(process.argv[2]).replace(/\D/g, '') || config.branchId;
}

const BRANCH_ID = String(config.branchId);
const CHANNEL_NAME = `branch-${BRANCH_ID}-orders`;
const LOG_FILE = path.join(__dirname, 'agent.log');

// ================= LOGGING HELPER =================
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > 2 * 1024 * 1024) {
      const oldLog = path.join(__dirname, 'agent.old.log');
      if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
      fs.renameSync(LOG_FILE, oldLog);
    }
  } catch (e) {}
}

log('====================================================');
log(`[OK] POS Print Agent active for BRANCH ${BRANCH_ID}`);
log(`Subscribed to: ${CHANNEL_NAME}`);
log(`Default Printer Target: ${config.printerIp}:${config.printerPort}`);
log('====================================================\n');

// ================= PUSHER CONNECTION WITH AUTO-HEALING =================
let pusher = null;
let channel = null;
let reconnectTimer = null;
let watchdogInterval = null;

function scheduleReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  log(`[PUSHER] Reconnecting in ${delayMs / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    try {
      if (pusher) pusher.connect();
    } catch (e) {
      log(`[PUSHER RECONNECT ERROR] ${e.message}`);
    }
  }, delayMs);
}

function initPusher() {
  if (pusher) {
    try { pusher.disconnect(); } catch (e) {}
  }

  pusher = new Pusher(config.pusherKey, {
    cluster: config.pusherCluster,
    forceTLS: true,
    activityTimeout: 15000,
    pongTimeout: 8000,
  });

  pusher.connection.bind('state_change', (states) => {
    log(`[PUSHER STATE] ${states.previous} -> ${states.current}`);
    if (['disconnected', 'unavailable', 'failed'].includes(states.current)) {
      scheduleReconnect(3000);
    }
  });

  pusher.connection.bind('connected', () => {
    log(`[STATUS] Connected to Pusher Cloud successfully for BRANCH ${BRANCH_ID}!`);
  });

  pusher.connection.bind('error', (err) => {
    log(`[PUSHER ERROR] ${err?.message || JSON.stringify(err)}`);
    scheduleReconnect(5000);
  });

  channel = pusher.subscribe(CHANNEL_NAME);

  channel.bind('print-kitchen-ticket', (data) => {
    log(`\n[TICKET RECEIVED] Branch ${BRANCH_ID} Order #${data.orderNumber || data.orderId || 'N/A'}`);
    dispatchPrint(data);
  });

  channel.bind('new-order', (data) => {
    log(`\n[ORDER RECEIVED] Branch ${BRANCH_ID} Order #${data.orderNumber || data.orderId || 'N/A'}`);
    dispatchPrint(data);
  });

  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(() => {
    if (!pusher || !pusher.connection) return;
    const st = pusher.connection.state;
    if (st !== 'connected' && st !== 'connecting') {
      log(`[WATCHDOG CHECK] Connection is ${st}. Forcing reconnect...`);
      try { pusher.connect(); } catch (e) {}
    }
  }, 30000);
}

// ================= THERMAL RECEIPT TEXT SANITIZER =================
// Thermal printers lack Arabic/Urdu fonts and print raw multi-byte UTF-8 as garbled symbols.
// This removes Arabic/Urdu characters while preserving clean English/Latin text, numbers, and symbols.
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

// ================= TICKET FORMATTER (ESC/POS 80mm THERMAL) =================
function buildTicket(data) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const INIT = ESC + '@';
  const RESET_LINE_SPACING = ESC + '2'; // Standard 1/6-inch line spacing (~34 dots)
  const BOLD_ON = ESC + 'E' + '\x01';
  const BOLD_OFF = ESC + 'E' + '\x00';
  const CENTER = ESC + 'a' + '\x01';
  const LEFT = ESC + 'a' + '\x00';
  const TEXT_NORMAL = GS + '!' + '\x00';
  const TEXT_DOUBLE_HEIGHT = GS + '!' + '\x01';
  const CUT = GS + 'V' + '\x41' + '\x03';
  const CRLF = '\r\n';
  const LINE_WIDTH = 42;

  const pad = (str, len) => {
    const s = String(str || '');
    if (s.length >= len) return s.slice(0, len);
    return s + ' '.repeat(len - s.length);
  };

  const centerText = (str, width = LINE_WIDTH) => {
    const s = String(str || '').trim();
    if (!s) return '';
    if (s.length >= width) return s.slice(0, width);
    const leftPad = Math.floor((width - s.length) / 2);
    return ' '.repeat(leftPad) + s;
  };

  const rightAlign = (leftStr, rightStr, width = LINE_WIDTH) => {
    const left = String(leftStr || '');
    const right = String(rightStr || '');
    const space = Math.max(1, width - (left.length + right.length));
    return left + ' '.repeat(space) + right;
  };

  let ticket = INIT + RESET_LINE_SPACING;

  // 1. Header: Branch & Order Type (Clean, Centered, Double-Height)
  const branchPart = data.branchId ? `B${data.branchId}` : `B${BRANCH_ID}`;
  const orderTypePart = sanitizeThermalText(data.orderType || '');
  const headerTitle = branchPart && orderTypePart ? `${branchPart} - ${orderTypePart}` : (branchPart || orderTypePart);

  ticket += CENTER;
  if (headerTitle) {
    ticket += BOLD_ON + TEXT_DOUBLE_HEIGHT + centerText(headerTitle) + TEXT_NORMAL + BOLD_OFF + CRLF;
  }

  // 2. Kitchen Notice (Clean English 2 lines, no corrupted Arabic)
  ticket += CRLF;
  ticket += centerText('Kitchen slip. Please get original slip') + CRLF;
  ticket += centerText('from counter.') + CRLF;
  ticket += CRLF;

  // 3. Table & Waiter (Centered, Bold)
  const metaParts = [];
  if (data.tableName) metaParts.push(sanitizeThermalText(data.tableName));
  if (data.waiterName) metaParts.push(`By: ${sanitizeThermalText(data.waiterName)}`);
  if (metaParts.length > 0) {
    ticket += BOLD_ON + centerText(metaParts.join(' | ')) + BOLD_OFF + CRLF;
  }

  // 4. Customer Info (Only if present)
  if (data.customerName || data.customerPhone || data.phone) {
    const custName = sanitizeThermalText(data.customerName || '');
    const custPhone = String(data.customerPhone || data.phone || '').trim();
    const custParts = [custName, custPhone].filter(Boolean);
    if (custParts.length > 0) {
      ticket += centerText(`Cust: ${custParts.join(' - ')}`) + CRLF;
    }
  }

  // 5. Order Number (Centered, Prominent Double-Height)
  const orderNumberStr = data.orderNumber ? ` - ${data.orderNumber}` : '';
  if (data.orderId || data.orderNumber) {
    ticket += CRLF;
    ticket += BOLD_ON + TEXT_DOUBLE_HEIGHT + centerText(`Order #${data.orderId || ''}${orderNumberStr}`) + TEXT_NORMAL + BOLD_OFF + CRLF;
  }

  // 6. Date & Time (Centered)
  const orderDate = data.createdAt
    ? new Date(data.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })
    : new Date().toLocaleString('en-US');
  ticket += centerText(`${orderDate} (KSA)`) + CRLF;

  // 7. Items Table Header
  ticket += LEFT;
  ticket += '-'.repeat(LINE_WIDTH) + CRLF;
  ticket += pad('Item', 24) + 'QTY'.padStart(6, ' ') + 'Amount'.padStart(12, ' ') + CRLF;
  ticket += '-'.repeat(LINE_WIDTH) + CRLF;

  // 8. Item Rows
  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item, index) => {
    const rawName = item.name || item.item_name || '';
    const cleanName = sanitizeThermalText(rawName);
    const itemTitle = `${index + 1}. ${cleanName}`;
    const qty = Number(item.qty || item.quantity || 1);
    const unitPrice = Number(item.amount || item.price || item.unit_price || 0);
    const amountNum = item.line_total ? Number(item.line_total) : (unitPrice * qty);
    const amountStr = `${data.currency || 'SAR'} ${amountNum.toFixed(2)}`;
    const qtyStr = String(qty);

    if (itemTitle.length <= 24) {
      ticket += pad(itemTitle, 24) + qtyStr.padStart(6, ' ') + amountStr.padStart(12, ' ') + CRLF;
    } else {
      ticket += itemTitle + CRLF;
      ticket += pad('', 24) + qtyStr.padStart(6, ' ') + amountStr.padStart(12, ' ') + CRLF;
    }

    if (qty > 1) {
      const uPriceStr = unitPrice % 1 === 0 ? unitPrice.toFixed(0) : unitPrice.toFixed(2);
      ticket += `   (${qty} @ ${data.currency || 'SAR'} ${uPriceStr})` + CRLF;
    }
  });

  // 9. Totals Section
  ticket += '-'.repeat(LINE_WIDTH) + CRLF;
  ticket += rightAlign('Total Items', String(data.totalItems || items.length), LINE_WIDTH) + CRLF;

  if (data.subtotal !== undefined && data.subtotal !== null) {
    ticket += rightAlign('Subtotal', `${data.currency || 'SAR'} ${Number(data.subtotal).toFixed(2)}`, LINE_WIDTH) + CRLF;
  }

  const discountVal = Number(data.discount || data.discountAmount || 0);
  if (discountVal > 0) {
    ticket += rightAlign('Discount', `-${data.currency || 'SAR'} ${discountVal.toFixed(2)}`, LINE_WIDTH) + CRLF;
  }

  const grandTotal = (data.total !== undefined && data.total !== null)
    ? Number(data.total || 0)
    : Math.max(0, items.reduce((s, it) => s + (Number(it.amount || it.price || 0) * (Number(it.qty || it.quantity || 1))), 0) - discountVal);

  ticket += '='.repeat(LINE_WIDTH) + CRLF;
  ticket += BOLD_ON + rightAlign('TOTAL', `${data.currency || 'SAR'} ${grandTotal.toFixed(2)}`, LINE_WIDTH) + BOLD_OFF + CRLF;
  ticket += '='.repeat(LINE_WIDTH) + CRLF;

  if (data.paymentStatus) {
    ticket += rightAlign('Payment', sanitizeThermalText(data.paymentStatus), LINE_WIDTH) + CRLF;
  }

  // 10. Clean Paper Feed & Cut
  ticket += CRLF + CRLF + CRLF + CRLF + CUT;

  return ticket;
}

// ================= PRINT DISPATCH LOGIC WITH RETRY =================
function dispatchPrint(data, retryCount = 0) {
  const targetIp = data.printerIp || config.printerIp || '127.0.0.1';
  const targetPort = config.printerPort || 9100;
  const socket = new net.Socket();

  socket.setTimeout(5000);

  log(`[DISPATCH] Connecting to printer at ${targetIp}:${targetPort}...`);

  socket.connect(targetPort, targetIp, () => {
    log(`[DISPATCH] Connected! Sending ticket for Order #${data.orderNumber || data.orderId}...`);

    const ticket = buildTicket(data);
    const buffer = Buffer.from(ticket, 'ascii');

    // Auto-update preview HTML
    try {
      const cleanSlip = ticket
        .replace(/\x1B\x32/g, '')
        .replace(/\x1B\x40/g, '')
        .replace(/\x1B\x45[\x00-\xFF]/g, '')
        .replace(/\x1B\x61[\x00-\xFF]/g, '')
        .replace(/\x1D\x21[\x00-\xFF]/g, '')
        .replace(/\x1D\x56[\x00-\xFF]{2}/g, '')
        .replace(/[\x00-\x09\x0B-\x1F]/g, '');
      const previewFile = path.join(__dirname, 'slip-preview.html');
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>POS Receipt Preview</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; background: #e9ecef; margin: 0; padding: 25px; display: flex; flex-direction: column; align-items: center; }
  .notice { font-size: 14px; color: #495057; margin-bottom: 15px; font-weight: bold; }
  .receipt { width: 340px; background: #fff; padding: 25px; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.12); font-family: 'Consolas', 'Courier New', monospace; font-size: 13px; line-height: 1.4; white-space: pre; word-break: break-word; color: #111; font-weight: 600; }
</style>
</head>
<body>
  <div class="notice">Virtual POS Receipt Preview (Auto-Updated on Every Print)</div>
  <div class="receipt">${cleanSlip.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`;
      fs.writeFileSync(previewFile, html, 'utf8');
    } catch (e) {}

    socket.write(buffer, (err) => {
      if (err) {
        log(`[PRINT ERROR] Socket write failed: ${err.message}`);
        socket.destroy();
        return;
      }
      socket.end();
      log(`[SUCCESS] Slip printed successfully for Order #${data.orderNumber || data.orderId}\n`);
    });
  });

  socket.on('error', (err) => {
    log(`[SOCKET ERROR on ${targetIp}:${targetPort}]: ${err.message}`);
    socket.destroy();
    if (retryCount < 2) {
      log(`[RETRY] Retrying in 2 seconds (Attempt ${retryCount + 1}/2)...`);
      setTimeout(() => dispatchPrint(data, retryCount + 1), 2000);
    }
  });

  socket.on('timeout', () => {
    log(`[SOCKET TIMEOUT] Printer unreachable at ${targetIp}:${targetPort}`);
    socket.destroy();
    if (retryCount < 1) {
      log(`[RETRY] Retrying in 3 seconds...`);
      setTimeout(() => dispatchPrint(data, retryCount + 1), 3000);
    }
  });
}

// ================= BACKGROUND CRASH PROTECTIONS =================
process.on('uncaughtException', (err) => {
  log(`[CRASH PREVENTED] Uncaught Exception: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  log(`[UNHANDLED REJECTION]: ${reason}`);
});

module.exports = { buildTicket, dispatchPrint };

if (require.main === module) {
  initPusher();
}
