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

// ================= ITEM URDU TRANSLATOR / CLEANER =================
const ITEM_URDU_MAP = {
  'garlic bread': 'گارلک بریڈ',
  'chicken biryani': 'مرغ بریانی',
  'mutton biryani': 'مٹن بریانی',
  'beef biryani': 'بیف بریانی',
  'veg biryani': 'سبزی بریانی',
  'chicken karahi': 'مرغ کڑاہی',
  'mutton karahi': 'مٹن کڑاہی',
  'chicken handi': 'مرغ ہانڈی',
  'chicken jalfrezi': 'مرغ جلفریزی',
  'chicken tikka': 'مرغ تکہ',
  'chicken boti': 'مرغ بوٹی',
  'chicken kabab': 'مرغ کباب',
  'seekh kabab': 'سیخ کباب',
  'reshmi kabab': 'ریشمی کباب',
  'chicken roast': 'مرغ روسٹ',
  'chicken broast': 'مرغ بروسٹ',
  'chicken burger': 'مرغ برگر',
  'beef burger': 'بیف برگر',
  'zinger burger': 'زنگر برگر',
  'chicken shawarma': 'مرغ شوارما',
  'chicken roll': 'مرغ رول',
  'paratha roll': 'پراٹھا رول',
  'french fries': 'فرینچ فرائز',
  'loaded fries': 'لوڈڈ فرائز',
  'cheese pizza': 'چیز پیزا',
  'chicken pizza': 'مرغ پیزا',
  'fajita pizza': 'فجیتا پیزا',
  'tikka pizza': 'تکہ پیزا',
  'bbq pizza': 'بی بی کیو پیزا',
  'pepperoni pizza': 'پیپرونی پیزا',
  'pepperoni supreme': 'پیپرونی سپریم پیزا',
  'margherita classic': 'مارگریٹا کلاسک پیزا',
  'four cheese': 'فور چیز پیزا',
  'veggie garden': 'ویجی گارڈن پیزا',
  'meat lovers': 'میٹ لورز پیزا',
  'bbq chicken feast': 'بی بی کیو مرغ پیزا',
  'family feast deal': 'فیملی فیسٹ ڈیل',
  'couple combo': 'کپل کومبو ڈیل',
  'gol gappy': 'گول گپے',
  'gol gappy (l)': 'گول گپے (L)',
  'mineral water': 'منرل واٹر',
  'water': 'منرل واٹر',
  'coca-cola 500ml': 'کوکا کولا 500 ملی',
  'coca-cola': 'کوکا کولا',
  'fresh lemonade': 'تازہ لیمونیڈ',
  'mango smoothie': 'مینگو سموتھی',
  'mint margarita': 'منٹ مارگریٹا',
  'cold drink': 'کولڈ ڈرنک',
  'karak chai': 'کڑک چائے',
  'green tea': 'سبز چائے',
  'garlic naan': 'گارلک نان',
  'cheese naan': 'چیز نان',
  'chicken wings': 'مرغ ونگز',
  'biryani': 'بریانی',
  'burger': 'برگر',
  'zinger': 'زنگر',
  'shawarma': 'شوارما',
  'roll': 'رول',
  'fries': 'فرائز',
  'pizza': 'پیزا',
  'margherita': 'مارگریٹا پیزا',
  'coke': 'کوک',
  'pepsi': 'پیپسی',
  '7up': 'سیون اپ',
  'sprite': 'سپرائٹ',
  'raita': 'رائتہ',
  'salad': 'سلاد',
  'roti': 'روٹی',
  'naan': 'نان',
  'paratha': 'پراٹھا',
  'nuggets': 'نگیٹس',
  'wings': 'ونگز'
};

const WORD_MAP = [
  [/chicken/i, 'مرغ'],
  [/garlic bread/i, 'گارلک بریڈ'],
  [/garlic/i, 'گارلک'],
  [/bread/i, 'بریڈ'],
  [/biryani/i, 'بریانی'],
  [/karahi/i, 'کڑاہی'],
  [/handi/i, 'ہانڈی'],
  [/jalfrezi/i, 'جلفریزی'],
  [/tikka/i, 'تکہ'],
  [/boti/i, 'بوٹی'],
  [/kabab/i, 'کباب'],
  [/kebab/i, 'کباب'],
  [/zinger/i, 'زنگر'],
  [/burger/i, 'برگر'],
  [/shawarma/i, 'شوارما'],
  [/pizza/i, 'پیزا'],
  [/fries/i, 'فرائز'],
  [/roll/i, 'رول'],
  [/sandwich/i, 'سینڈوچ'],
  [/nuggets/i, 'نگیٹس'],
  [/wings/i, 'ونگز'],
  [/mutton/i, 'مٹن'],
  [/beef/i, 'بیف'],
  [/fish/i, 'مچھلی'],
  [/cheese/i, 'چیز'],
  [/water/i, 'منرل واٹر'],
  [/deal/i, 'ڈیل'],
  [/special/i, 'اسپیشل'],
  [/salad/i, 'سلاد'],
  [/sauce/i, 'ساس'],
  [/small/i, 'چھوٹا'],
  [/medium/i, 'درمیانہ'],
  [/large/i, 'بڑا']
];

function formatItemUrdu(rawName) {
  if (!rawName) return '';
  let str = String(rawName).trim();

  // 1. Clean previous inverted Urdu phrases if present
  str = str.replace(/بریانی مرغ/g, 'مرغ بریانی');
  str = str.replace(/بریڈ گارلک/g, 'گارلک بریڈ');
  str = str.replace(/کڑاہی مرغ/g, 'مرغ کڑاہی');
  str = str.replace(/ہانڈی مرغ/g, 'مرغ ہانڈی');
  str = str.replace(/تکہ مرغ/g, 'مرغ تکہ');
  str = str.replace(/بوٹی مرغ/g, 'مرغ بوٹی');
  str = str.replace(/کباب مرغ/g, 'مرغ کباب');
  str = str.replace(/قورمہ مرغ/g, 'مرغ قورمہ');
  str = str.replace(/پلاؤ مرغ/g, 'مرغ پلاؤ');
  str = str.replace(/شوارما مرغ/g, 'مرغ شوارما');
  str = str.replace(/بروسٹ مرغ/g, 'مرغ بروسٹ');
  str = str.replace(/برگر مرغ/g, 'مرغ برگر');
  str = str.replace(/پیزا مرغ/g, 'مرغ پیزا');
  str = str.replace(/ونگز مرغ/g, 'مرغ ونگز');
  str = str.replace(/رول مرغ/g, 'مرغ رول');
  str = str.replace(/نان گارلک/g, 'گارلک نان');

  // 2. Replace Arabic phrases with proper Urdu (chicken = مرغ pehle)
  str = str.replace(/برياني دجاج/g, 'مرغ بریانی');
  str = str.replace(/دجاج برياني/g, 'مرغ بریانی');
  str = str.replace(/دجاج جالفريزي/g, 'مرغ جلفریزی');
  str = str.replace(/شواية دجاج/g, 'مرغ شواية');
  str = str.replace(/دجاج شواية/g, 'مرغ شواية');
  str = str.replace(/فحم دجاج/g, 'مرغ فحم');
  str = str.replace(/دجاج فحم/g, 'مرغ فحم');
  str = str.replace(/دجاج الفحم/g, 'مرغ الفحم');
  str = str.replace(/دجاج كراهي/g, 'مرغ کڑاہی');
  str = str.replace(/كراهي دجاج/g, 'مرغ کڑاہی');
  str = str.replace(/دجاج تكا/g, 'مرغ تکہ');
  str = str.replace(/تكا دجاج/g, 'مرغ تکہ');
  str = str.replace(/دجاج بوتي/g, 'مرغ بوٹی');
  str = str.replace(/هاندي دجاج/g, 'مرغ ہانڈی');
  str = str.replace(/دجاج هاندي/g, 'مرغ ہانڈی');
  str = str.replace(/كباب دجاج/g, 'مرغ کباب');
  str = str.replace(/دجاج كباب/g, 'مرغ کباب');
  str = str.replace(/دجاج كورما/g, 'مرغ قورمہ');
  str = str.replace(/كورما دجاج/g, 'مرغ قورمہ');
  str = str.replace(/بولاو دجاج/g, 'مرغ پلاؤ');
  str = str.replace(/دجاج بولاو/g, 'مرغ پلاؤ');
  str = str.replace(/حليم دجاج/g, 'مرغ حلیم');
  str = str.replace(/شوارما دجاج/g, 'مرغ شوارما');
  str = str.replace(/دجاج شوارما/g, 'مرغ شوارما');
  str = str.replace(/بروست دجاج/g, 'مرغ بروسٹ');
  str = str.replace(/دجاج بروست/g, 'مرغ بروسٹ');
  str = str.replace(/دجاج بالزبدة/g, 'بٹر چکن (مرغ)');
  str = str.replace(/دجاج مشوي/g, 'مرغ مشوی');
  str = str.replace(/دجاج/g, 'مرغ');
  str = str.replace(/لحم ضأن/g, 'مٹن');
  str = str.replace(/لحم/g, 'گوشت');
  str = str.replace(/أرز/g, 'چاول');
  str = str.replace(/الرز/g, 'چاول');
  str = str.replace(/ماء/g, 'پانی');
  str = str.replace(/نان الثوم/g, 'گارلک نان');

  let result = str;

  // If does not contain Urdu/Arabic characters, find Urdu equivalent
  if (!/[\u0600-\u06FF]/.test(str)) {
    const cleanKey = str.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    if (ITEM_URDU_MAP[cleanKey]) {
      result = `${str} - ${ITEM_URDU_MAP[cleanKey]}`;
    } else {
      const sortedKeys = Object.keys(ITEM_URDU_MAP).sort((a, b) => b.length - a.length);
      let matched = false;
      for (const k of sortedKeys) {
        if (k.includes(' ') && (cleanKey === k || cleanKey.includes(k))) {
          result = `${str} - ${ITEM_URDU_MAP[k]}`;
          matched = true;
          break;
        }
      }
      if (!matched) {
        let urduWords = [];
        for (const [regex, urdu] of WORD_MAP) {
          if (regex.test(str)) {
            urduWords.push(urdu);
          }
        }
        if (urduWords.length > 0) {
          result = `${str} - ${[...new Set(urduWords)].join(' ')}`;
        } else {
          for (const k of sortedKeys) {
            if (cleanKey.includes(k)) {
              result = `${str} - ${ITEM_URDU_MAP[k]}`;
              break;
            }
          }
        }
      }
    }
  }

  return result;
}

// ================= TICKET FORMATTER =================
function buildTicket(data) {
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
  const UTF8_MODE = ESC + '\x25' + '\x47' + '\x01';

  // 80mm Full Width without extra margin
  const LINE_WIDTH = 42;

  const pad = (str, len) => ((str || '') + ' '.repeat(len)).slice(0, len);
  const centerText = (str, width = LINE_WIDTH) => {
    const s = String(str || '').trim();
    if (!s) return '';
    if (s.length >= width) return s;
    const leftPad = Math.floor((width - s.length) / 2);
    return ' '.repeat(leftPad) + s;
  };
  const rightAlign = (leftStr, rightStr, width = LINE_WIDTH) => {
    const space = Math.max(1, width - (String(leftStr).length + String(rightStr).length));
    return leftStr + ' '.repeat(space) + rightStr;
  };

  let ticket = INIT + UTF8_MODE;

  // 1. Header: Branch & Order Type (Clean Standard Format - CENTERED)
  const branchPart = data.branchId ? `B${data.branchId}` : `B${BRANCH_ID}`;
  const orderTypePart = data.orderType || '';
  let headerTitle = '';

  if (branchPart && orderTypePart) {
    headerTitle = `${branchPart} - ${orderTypePart}`;
  } else {
    headerTitle = branchPart || orderTypePart;
  }

  ticket += CENTER;
  if (headerTitle) {
    ticket += BOLD_ON + TEXT_DOUBLE + centerText(headerTitle) + '\n' + TEXT_NORMAL + BOLD_OFF;
  }

  // 2. Kitchen Notice (English + Urdu Notice - CENTERED)
  ticket += '\n' + centerText('Kitchen slip. Please get original slip from') + '\n';
  ticket += centerText('counter.') + '\n';
  ticket += centerText('اصل پرچی کاؤنٹر سے حاصل کریں۔') + '\n\n';

  // 3. Table & Waiter (Dynamic - CENTERED)
  const metaParts = [];
  if (data.tableName) metaParts.push(data.tableName);
  if (data.waiterName) metaParts.push(`By: ${data.waiterName}`);
  if (metaParts.length > 0) {
    ticket += BOLD_ON + centerText(metaParts.join(' | ')) + '\n' + BOLD_OFF;
  }

  // 4. Customer Info (Only if present - CENTERED)
  if (data.customerName || data.customerPhone || data.phone) {
    const custName = data.customerName || '';
    const custPhone = data.customerPhone || data.phone || '';
    const customerText = [custName, custPhone].filter(Boolean).join(' - ');
    ticket += centerText(`Cust: ${customerText}`) + '\n';
  }

  // 5. Order Number (CENTERED)
  const orderNumberStr = data.orderNumber ? ` - ${data.orderNumber}` : '';
  if (data.orderId || data.orderNumber) {
    ticket += BOLD_ON + TEXT_DOUBLE + centerText(`Order #${data.orderId || ''}${orderNumberStr}`) + '\n' + TEXT_NORMAL + BOLD_OFF;
  }

  // 6. Date & Time (CENTERED)
  const orderDate = data.createdAt
    ? new Date(data.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })
    : new Date().toLocaleString('en-US');
  ticket += centerText(`${orderDate} (KSA)`) + '\n';

  // 7. Items Table (Formatted QTY: 1 -> 1, >1 -> 2 (10), Amount right aligned)
  ticket += LEFT;
  ticket += '-'.repeat(LINE_WIDTH) + '\n';
  ticket += pad('Item', 18) + pad('QTY', 12) + 'Amount'.padStart(12, ' ') + '\n';
  ticket += '-'.repeat(LINE_WIDTH) + '\n';

  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item, index) => {
    let rawItemName = item.name || item.item_name || '';
    let itemName = formatItemUrdu(rawItemName);
    const itemTitle = `${index + 1}. ${itemName}`;
    const qty = Number(item.qty || item.quantity || 1);
    const unitPrice = Number(item.amount || item.price || item.unit_price || 0);
    const amountNum = item.line_total ? Number(item.line_total) : (unitPrice * qty);
    const amountStr = `${data.currency || 'SAR'} ${amountNum.toFixed(2)}`;

    const uPriceStr = (unitPrice % 1 === 0 ? unitPrice : unitPrice.toFixed(2));
    const qtyStr = qty > 1 ? `${qty} (${uPriceStr})` : String(qty);

    ticket += itemTitle + '\n';
    ticket += pad('', 18) + pad(qtyStr, 12) + amountStr.padStart(12, ' ') + '\n';
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

  const grandTotal = (data.total !== undefined && data.total !== null)
    ? Number(data.total || 0)
    : Math.max(0, items.reduce((s, it) => s + (Number(it.amount || it.price || 0) * (Number(it.qty || it.quantity || 1))), 0) - discountVal);

  // TOTAL (Double Line + Bold, Right-aligned to edge 42)
  ticket += '='.repeat(LINE_WIDTH) + '\n';
  ticket += BOLD_ON + rightAlign('TOTAL', `${data.currency || 'SAR'} ${grandTotal.toFixed(2)}`, LINE_WIDTH) + BOLD_OFF + '\n';
  ticket += '='.repeat(LINE_WIDTH) + '\n';

  // Payment Status (Dynamic)
  if (data.paymentStatus) {
    ticket += rightAlign('Payment', data.paymentStatus) + '\n';
  }

  // Paper Cut
  ticket += '\n\n\n\n' + CUT;

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
    const buffer = Buffer.from(ticket, 'utf8');

    // Auto-update preview HTML
    try {
      const cleanSlip = ticket
        .replace(/\x1B\x25\x47[\x00-\xFF]/g, '')
        .replace(/\x1B\x40/g, '')
        .replace(/\x1B\x45[\x00-\xFF]/g, '')
        .replace(/\x1B\x61[\x00-\xFF]/g, '')
        .replace(/\x1D\x21[\x00-\xFF]/g, '')
        .replace(/\x1D\x56[\x00-\xFF]{2}/g, '')
        .replace(/[\x00-\x09\x0B-\x1F]/g, '');
      const previewFile = path.join(__dirname, 'slip-preview.html');
      const html = `<!DOCTYPE html>
<html lang="ur">
<head>
<meta charset="utf-8">
<title>POS Receipt Preview</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #e9ecef; margin: 0; padding: 25px; display: flex; flex-direction: column; align-items: center; }
  .notice { font-size: 14px; color: #495057; margin-bottom: 15px; font-weight: bold; }
  .receipt { width: 340px; background: #fff; padding: 25px; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.12); font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; color: #111; }
  .urdu-line { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 14px; }
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
