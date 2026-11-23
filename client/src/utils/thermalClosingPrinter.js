import { formatSaudiDate, formatSaudiTime, formatSaudiDateTime } from './timezone';

const CURRENCY = 'SAR';

/**
 * Common 80mm Thermal CSS Stylesheet
 * Optimized strictly for 80mm thermal receipt printers (printable area 72mm).
 * Prevents right-side clipping, avoids oversized A4 blank paper waste,
 * and ensures text and currency amounts wrap and align safely.
 */
const THERMAL_80MM_CSS = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  @media print {
    html, body {
      width: 72mm !important;
      max-width: 72mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
    }
  }
  * {
    box-sizing: border-box !important;
    color: #000000 !important;
    background: transparent;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace;
    width: 72mm !important;
    max-width: 72mm !important;
    margin: 0 auto !important;
    padding: 2mm 1.5mm 6mm 1.5mm !important;
    font-size: 11px;
    line-height: 1.25;
    color: #000000 !important;
    font-weight: 600;
    -webkit-font-smoothing: antialiased;
    background: #ffffff !important;
  }
  .thermal-header {
    text-align: center;
    margin: 0 0 3px 0;
  }
  .thermal-brand {
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.5px;
    margin: 0;
    text-transform: uppercase;
  }
  .thermal-sub {
    font-size: 10px;
    font-weight: 700;
    margin: 1px 0 0 0;
    letter-spacing: 0.3px;
  }
  .thermal-title {
    text-align: center;
    font-size: 12.5px;
    font-weight: 900;
    letter-spacing: 0.5px;
    margin: 4px 0 2px 0;
    text-transform: uppercase;
  }
  .thermal-date {
    text-align: center;
    font-size: 10.5px;
    font-weight: 700;
    margin: 1px 0 4px 0;
  }
  .thermal-divider {
    border-top: 1.5px dashed #000000;
    margin: 4px 0;
    width: 100%;
  }
  .thermal-divider-solid {
    border-top: 1.5px solid #000000;
    margin: 4px 0;
    width: 100%;
  }
  .thermal-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5px 0;
    font-size: 11px;
    line-height: 1.25;
    width: 100%;
  }
  .thermal-row .label {
    font-weight: 600;
    flex: 1 1 auto;
    word-break: break-word;
    overflow-wrap: break-word;
    padding-right: 4px;
  }
  .thermal-row .val {
    font-weight: 800;
    flex-shrink: 0;
    text-align: right;
    white-space: nowrap;
  }
  .thermal-box {
    border: 1.5px solid #000000;
    border-radius: 3px;
    padding: 3px 4px;
    margin: 3px 0;
  }
  .thermal-box-title {
    font-weight: 900;
    font-size: 10.5px;
    text-align: center;
    border-bottom: 1px solid #000000;
    padding-bottom: 2px;
    margin-bottom: 3px;
    text-transform: uppercase;
  }
  .thermal-diff-banner {
    border: 1.5px solid #000000;
    border-radius: 4px;
    padding: 3px 4px;
    text-align: center;
    margin: 3px 0;
    font-weight: 800;
    font-size: 11.5px;
  }
  table.thermal-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    margin: 2px 0;
    font-size: 10.5px;
  }
  table.thermal-table th {
    border-bottom: 1.5px solid #000000;
    padding: 2px 1px;
    font-size: 10px;
    font-weight: 800;
    text-align: left;
  }
  table.thermal-table td {
    padding: 2px 1px;
    font-size: 10.5px;
    font-weight: 600;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  table.thermal-table .text-right {
    text-align: right !important;
  }
  table.thermal-table .text-center {
    text-align: center !important;
  }
  .thermal-footer {
    text-align: center;
    font-size: 9.5px;
    font-weight: 700;
    margin: 5px 0 0 0;
  }
`;

/**
 * Prints a Shift Closing or Daily Closing Report on an 80mm Thermal Printer.
 * Content is strictly bound to 72mm width to prevent right-side cutoffs.
 */
export function printClosingSlip(report, computeDailyComparativeDataFn) {
  if (!report) return;

  const fmtTime = (ts) => (ts ? formatSaudiTime(ts) : '-');
  const fmtDate = (ts) => (ts ? formatSaudiDate(ts) : '-');

  let items = [];
  try {
    items = Array.isArray(report.items_summary)
      ? report.items_summary
      : JSON.parse(report.items_summary || '[]');
  } catch (e) {
    items = [];
  }

  const diffVal = parseFloat(report.difference || 0);
  const hasDiff = !isNaN(diffVal) && Math.abs(diffVal) >= 0.01;
  const diffSign = diffVal < 0 ? '-' : '+';
  const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ';

  let shiftsArr = [];
  if (report.closing_type === 'Daily') {
    if (typeof report.shifts_summary === 'string') {
      try {
        shiftsArr = JSON.parse(report.shifts_summary);
      } catch (e) {
        shiftsArr = [];
      }
    } else if (Array.isArray(report.shifts_summary)) {
      shiftsArr = report.shifts_summary;
    }
  }

  const isDaily = report.closing_type === 'Daily';
  const reportHeading = isDaily ? '⚡ DAILY CLOSING REPORT' : '🔄 SHIFT CLOSING REPORT';

  let comparativeHtml = '';
  if (isDaily && typeof computeDailyComparativeDataFn === 'function') {
    const compData = computeDailyComparativeDataFn(
      shiftsArr,
      null,
      null,
      report,
      report.cashier_name || 'Cashier'
    );
    const fmt = (v) => (v !== null && v !== undefined && !isNaN(v) ? parseFloat(v).toFixed(2) : '0.00');
    const fmtDiff = (d) => {
      if (d === null || d === undefined || isNaN(d)) return '-';
      if (Math.abs(d) < 0.005) return '0.00';
      return d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2);
    };

    comparativeHtml = `
      <div class="thermal-box">
        <div class="thermal-box-title">DAILY COMPARATIVE: DAY + NIGHT</div>

        <!-- NIGHT SHIFT -->
        <div style="border: 1px solid #000; border-radius: 2px; padding: 2px 3px; margin-bottom: 3px;">
          <div style="display:flex; justify-content:space-between; font-weight:800; font-size:10px; border-bottom:1px solid #000; padding-bottom:1px; margin-bottom:2px;">
            <span>🌙 NIGHT SHIFT</span>
            <span>${compData.nightCashier || ''}</span>
          </div>
          <table class="thermal-table">
            <thead>
              <tr style="border-bottom: 1px dashed #000; font-size: 9.5px;">
                <th style="width: 44%;">Item</th>
                <th class="text-right" style="width: 28%;">Sys</th>
                <th class="text-right" style="width: 28%;">Act</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cash</td>
                <td class="text-right">${fmt(compData.nightSysCash)}</td>
                <td class="text-right">${fmt(compData.nightActCash)}</td>
              </tr>
              <tr>
                <td>Card</td>
                <td class="text-right">${fmt(compData.nightSysCard)}</td>
                <td class="text-right">${fmt(compData.nightActCard)}</td>
              </tr>
              <tr>
                <td>Credit</td>
                <td class="text-right">${fmt(compData.nightSysCredit)}</td>
                <td class="text-right">${fmt(compData.nightActCredit)}</td>
              </tr>
              <tr>
                <td>Major Pay</td>
                <td class="text-right">${fmt(compData.nightSysMajor)}</td>
                <td class="text-right">${fmt(compData.nightActMajor)}</td>
              </tr>
              <tr style="border-top: 1px dashed #000; font-weight: 800;">
                <td>Diff</td>
                <td colspan="2" class="text-right" style="font-size: 10.5px;">${fmtDiff(compData.nightDiff)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- DAY SHIFT -->
        <div style="border: 1px solid #000; border-radius: 2px; padding: 2px 3px; margin-bottom: 3px;">
          <div style="display:flex; justify-content:space-between; font-weight:800; font-size:10px; border-bottom:1px solid #000; padding-bottom:1px; margin-bottom:2px;">
            <span>☀️ DAY SHIFT</span>
            <span>${compData.dayCashier || ''}</span>
          </div>
          <table class="thermal-table">
            <thead>
              <tr style="border-bottom: 1px dashed #000; font-size: 9.5px;">
                <th style="width: 44%;">Item</th>
                <th class="text-right" style="width: 28%;">Sys</th>
                <th class="text-right" style="width: 28%;">Act</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cash</td>
                <td class="text-right">${fmt(compData.daySysCash)}</td>
                <td class="text-right">${fmt(compData.dayActCash)}</td>
              </tr>
              <tr>
                <td>Card</td>
                <td class="text-right">${fmt(compData.daySysCard)}</td>
                <td class="text-right">${fmt(compData.dayActCard)}</td>
              </tr>
              <tr>
                <td>Credit</td>
                <td class="text-right">${fmt(compData.daySysCredit)}</td>
                <td class="text-right">${fmt(compData.dayActCredit)}</td>
              </tr>
              <tr>
                <td>Major Pay</td>
                <td class="text-right">${fmt(compData.daySysMajor)}</td>
                <td class="text-right">${fmt(compData.dayActMajor)}</td>
              </tr>
              <tr style="border-top: 1px dashed #000; font-weight: 800;">
                <td>Diff</td>
                <td colspan="2" class="text-right" style="font-size: 10.5px;">${fmtDiff(compData.dayDiff)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- TOTAL COMBINED -->
        <div style="border: 1.5px solid #000; border-radius: 2px; padding: 2px 3px;">
          <div style="font-weight:900; font-size:10px; text-align:center; border-bottom:1px solid #000; padding-bottom:1px; margin-bottom:2px; text-transform:uppercase;">
            ⚡ TOTAL COMBINED (DAY + NIGHT)
          </div>
          <table class="thermal-table">
            <thead>
              <tr style="border-bottom: 1px dashed #000; font-size: 9.5px; font-weight: 800;">
                <th style="width: 44%;">Item</th>
                <th class="text-right" style="width: 28%;">Tot Sys</th>
                <th class="text-right" style="width: 28%;">Tot Act</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight:800;">Cash</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalSysCash)}</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalActCash)}</td>
              </tr>
              <tr>
                <td style="font-weight:800;">Card</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalSysCard)}</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalActCard)}</td>
              </tr>
              <tr>
                <td style="font-weight:800;">Credit</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalSysCredit)}</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalActCredit)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #000;">
                <td style="font-weight:800;">Major Pay</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalSysMajor)}</td>
                <td class="text-right" style="font-weight:800;">${fmt(compData.totalActMajor)}</td>
              </tr>
              <tr style="font-weight: 900;">
                <td>Total Diff</td>
                <td colspan="2" class="text-right" style="font-size: 11px;">${fmtDiff(compData.totalDiff)}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 2px; border-top: 1px dashed #000; padding-top: 1px; font-size: 9px; text-align: right; font-weight: 800;">
            Cash: ${fmtDiff(compData.totalCashDiff)} | Card: ${fmtDiff(compData.totalCardDiff)}
          </div>
        </div>
      </div>
    `;
  }

  const printWindow = window.open('', '', 'width=450,height=700');
  if (!printWindow) {
    alert('Please allow popups to print the thermal closing slip.');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${report.closing_type} Closing Slip</title>
        <style>${THERMAL_80MM_CSS}</style>
      </head>
      <body>
        <div class="thermal-header">
          <div class="thermal-brand">AL RAWAQ RESTAURANT</div>
          <div class="thermal-sub">مطعم الرواق — Point of Sale</div>
        </div>

        <div class="thermal-title">${reportHeading}</div>
        <div class="thermal-date">${fmtDate(report.login_time)}</div>

        ${hasDiff ? `
          <div class="thermal-diff-banner">
            <div>VARIANCE: ${diffSign}${CURRENCY} ${Math.abs(diffVal).toFixed(2)}</div>
            <div style="font-size: 9.5px; opacity: 0.9;">${diffLabel}</div>
            ${report.difference_reason ? `<div style="font-size: 9.5px; margin-top: 2px; border-top: 1px dashed #000; padding-top: 2px; text-align: left; font-weight: 600;">Reason: ${report.difference_reason}</div>` : ''}
          </div>
        ` : ''}

        ${comparativeHtml}

        <div class="thermal-divider"></div>
        <div class="thermal-row"><span class="label">Cashier:</span><span class="val">${report.cashier_name || '-'}</span></div>
        <div class="thermal-row"><span class="label">Branch:</span><span class="val">${report.branch || '-'}</span></div>
        <div class="thermal-row"><span class="label">Active Time:</span><span class="val">${fmtTime(report.login_time)} - ${fmtTime(report.logout_time)} (${report.total_active_time || '-'})</span></div>
        <div class="thermal-row"><span class="label">Total Orders:</span><span class="val">${report.total_orders || 0}</span></div>

        ${!isDaily ? `
          <div class="thermal-divider"></div>
          <div class="thermal-row"><span class="label">Total Sales:</span><span class="val" style="font-size:12px;">${CURRENCY} ${parseFloat(report.total_sales || 0).toFixed(2)}</span></div>
          <div class="thermal-row"><span class="label" style="padding-left: 6px; font-size: 10px;">↳ Cash:</span><span class="val">${CURRENCY} ${parseFloat(report.cash_sales || 0).toFixed(2)}</span></div>
          <div class="thermal-row"><span class="label" style="padding-left: 6px; font-size: 10px;">↳ Card:</span><span class="val">${CURRENCY} ${parseFloat(report.card_sales || 0).toFixed(2)}</span></div>
          <div class="thermal-row"><span class="label" style="padding-left: 6px; font-size: 10px;">↳ Credit:</span><span class="val">${CURRENCY} ${parseFloat(report.credit_sales || 0).toFixed(2)}</span></div>
          <div class="thermal-row"><span class="label">Major Payments:</span><span class="val">${CURRENCY} ${parseFloat(report.major_payments || 0).toFixed(2)}</span></div>
          <div class="thermal-row" style="font-weight: 900;"><span class="label">Total Received:</span><span class="val">${CURRENCY} ${(parseFloat(report.cash_sales || 0) + parseFloat(report.card_sales || 0) + parseFloat(report.major_payments || 0)).toFixed(2)}</span></div>
        ` : ''}

        <div class="thermal-divider"></div>
        ${parseFloat(report.opening_cash || 0) > 0 ? `<div class="thermal-row"><span class="label">Opening Drawer:</span><span class="val">${CURRENCY} ${parseFloat(report.opening_cash).toFixed(2)}</span></div>` : ''}
        <div class="thermal-row"><span class="label">Cash Counted:</span><span class="val">${CURRENCY} ${parseFloat(report.closing_cash || 0).toFixed(2)}</span></div>
        <div class="thermal-row"><span class="label">Card Counted:</span><span class="val">+ ${CURRENCY} ${parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0)).toFixed(2)}</span></div>
        <div class="thermal-row" style="font-weight: 900;"><span class="label">Total Counted:</span><span class="val">= ${CURRENCY} ${(parseFloat(report.closing_cash || 0) + parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0))).toFixed(2)}</span></div>

        ${!isDaily && hasDiff ? `
          <div class="thermal-row" style="font-weight: 900;"><span class="label">Difference:</span><span class="val">${diffSign}${CURRENCY} ${Math.abs(diffVal).toFixed(2)}</span></div>
          ${report.cash_difference !== null && report.cash_difference !== undefined ? `<div class="thermal-row" style="font-size: 10px;"><span class="label" style="padding-left: 6px;">↳ Cash Diff:</span><span class="val">${parseFloat(report.cash_difference) < 0 ? '-' : '+'}${CURRENCY} ${Math.abs(parseFloat(report.cash_difference)).toFixed(2)}</span></div>` : ''}
          ${report.card_difference !== null && report.card_difference !== undefined ? `<div class="thermal-row" style="font-size: 10px;"><span class="label" style="padding-left: 6px;">↳ Card Diff:</span><span class="val">${parseFloat(report.card_difference) < 0 ? '-' : '+'}${CURRENCY} ${Math.abs(parseFloat(report.card_difference)).toFixed(2)}</span></div>` : ''}
          ${report.difference_reason ? `<div class="thermal-row" style="font-size: 10px;"><span class="label">Diff Reason:</span><span class="val">${report.difference_reason}</span></div>` : ''}
        ` : ''}

        ${items && items.length > 0 ? `
          <div class="thermal-divider"></div>
          <div style="font-weight:800; font-size:10.5px; margin: 2px 0 3px 0;">Sales by Category:</div>
          <table class="thermal-table">
            <thead>
              <tr>
                <th style="width: 50%;">Category</th>
                <th class="text-center" style="width: 18%;">Qty</th>
                <th class="text-right" style="width: 32%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => `
                <tr style="border-bottom: 1px dashed #000;">
                  <td>${i.category}</td>
                  <td class="text-center">${i.qty}</td>
                  <td class="text-right">${CURRENCY} ${parseFloat(i.amount || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="thermal-divider"></div>
        <div class="thermal-footer">
          Generated: ${formatSaudiDateTime(new Date())}<br/>
          *** END OF CLOSING REPORT ***
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}

/**
 * Prints the Today's Sales & Shift Summary on an 80mm Thermal Printer.
 * Correctly positions the Title at the very top, displays summary data immediately below,
 * auto-sizes height (no blank paper waste), and safely wraps within 72mm.
 */
export function printTodaySummarySlip({
  brandName = 'AL RAWAQ RESTAURANT',
  reportDate = new Date().toISOString().slice(0, 10),
  branchName = 'Branch 1',
  cashierName = 'Active Cashier',
  totalSys = 0,
  totalAct = 0,
  totalDiff = 0,
  stats = {},
  targetRevenue = 0
}) {
  const diffIsPositive = totalDiff >= 0;
  const printWindow = window.open('', '', 'width=450,height=700');
  if (!printWindow) {
    alert('Please allow popups to print Today Summary.');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Today-Summary-${reportDate}</title>
        <style>${THERMAL_80MM_CSS}</style>
      </head>
      <body>
        <!-- Header at the VERY TOP of the thermal slip -->
        <div class="thermal-header">
          <div class="thermal-brand">${brandName}</div>
          <div class="thermal-sub">مطعم الرواق — Today's Summary</div>
        </div>

        <div class="thermal-title">📋 TODAY'S SALES & SHIFT SUMMARY</div>
        <div class="thermal-date">Date: ${reportDate} | Generated: ${formatSaudiDateTime(new Date())}</div>

        <div class="thermal-divider"></div>
        <div class="thermal-row"><span class="label">Branch:</span><span class="val">${branchName}</span></div>
        <div class="thermal-row"><span class="label">Cashier(s):</span><span class="val">${cashierName}</span></div>

        <!-- Key Financial Summary Box -->
        <div class="thermal-box" style="margin-top: 4px;">
          <div class="thermal-row">
            <span class="label">System Sales:</span>
            <span class="val">${CURRENCY} ${totalSys.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="thermal-row">
            <span class="label">Actual Counted:</span>
            <span class="val">${CURRENCY} ${totalAct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="thermal-row" style="border-top: 1px dashed #000; padding-top: 2px; font-weight: 800;">
            <span class="label">Difference:</span>
            <span class="val" style="font-size: 11.5px;">${diffIsPositive ? '+' : ''}${CURRENCY} ${totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${diffIsPositive ? 'Balanced/Surplus' : 'Shortage'})</span>
          </div>
        </div>

        <div class="thermal-divider"></div>
        <div style="font-weight: 800; font-size: 10.5px; margin: 3px 0 2px 0;">Performance & Financial Breakdown:</div>

        <table class="thermal-table">
          <thead>
            <tr>
              <th style="width: 58%;">Metric</th>
              <th class="text-right" style="width: 42%;">Amount / Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Cash Sales</strong></td>
              <td class="text-right"><strong>${CURRENCY} ${(stats?.cashSale || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            </tr>
            <tr>
              <td><strong>Card Sales</strong></td>
              <td class="text-right"><strong>${CURRENCY} ${(stats?.cardSale || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            </tr>
            <tr>
              <td>Total Orders Completed</td>
              <td class="text-right">${stats?.totalOrders || 0}</td>
            </tr>
            <tr>
              <td>Total Production Cost</td>
              <td class="text-right">${CURRENCY} ${(stats?.totalProductCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>Operating Gross Revenue</td>
              <td class="text-right">${CURRENCY} ${(stats?.dailyRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            ${targetRevenue > 0 ? `
              <tr>
                <td>Daily Target</td>
                <td class="text-right">${CURRENCY} ${targetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="thermal-divider"></div>
        <div class="thermal-footer">
          Al Rawaq Management ERP — 80mm POS Slip<br/>
          *** END OF TODAY'S SUMMARY ***
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}
