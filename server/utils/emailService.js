const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const pool = require('../db');

// In-memory deduplication cache to prevent duplicate email bursts (30s TTL)
const emailDedupeMap = new Map();

// Helper to cleanup stale cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of emailDedupeMap.entries()) {
    if (now - timestamp > 60000) {
      emailDedupeMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Resolve recipient emails from DB settings table (report_emails),
 * falling back to process.env.REPORT_TO_EMAILS
 */
async function getRecipientEmails() {
  let toEmails = [];
  try {
    const settingsRes = await pool.query('SELECT report_emails FROM settings ORDER BY id ASC LIMIT 1');
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].report_emails) {
      const dbEmails = settingsRes.rows[0].report_emails;
      if (Array.isArray(dbEmails)) {
        toEmails = dbEmails.map(e => (typeof e === 'string' ? e.trim() : '')).filter(Boolean);
      } else if (typeof dbEmails === 'string') {
        try {
          const parsed = JSON.parse(dbEmails);
          if (Array.isArray(parsed)) {
            toEmails = parsed.map(e => (typeof e === 'string' ? e.trim() : '')).filter(Boolean);
          }
        } catch (_) {
          toEmails = dbEmails.split(',').map(e => e.trim()).filter(Boolean);
        }
      }
    }
  } catch (dbErr) {
    console.warn('[Email Service] Could not load report_emails from settings table:', dbErr.message);
  }

  // Fallback to REPORT_TO_EMAILS in .env
  if (!toEmails || toEmails.length === 0) {
    const toEmailsStr = process.env.REPORT_TO_EMAILS;
    if (toEmailsStr) {
      toEmails = toEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }
  }

  // Validate email formats and deduplicate
  const validRecipients = (toEmails || [])
    .map(e => (typeof e === 'string' ? e.trim() : ''))
    .filter(e => e && e.includes('@') && e.includes('.'));

  return Array.from(new Set(validRecipients));
}

/**
 * Build configured SMTP transporter config (supports DB settings, Zoho, generic SMTP, and Gmail)
 */
async function getSmtpConfig() {
  let dbConfig = null;
  try {
    const res = await pool.query('SELECT smtp_config FROM settings ORDER BY id ASC LIMIT 1');
    if (res.rows.length > 0 && res.rows[0].smtp_config) {
      dbConfig = typeof res.rows[0].smtp_config === 'string'
        ? JSON.parse(res.rows[0].smtp_config)
        : res.rows[0].smtp_config;
    }
  } catch (err) {
    console.warn('[Email Service] Could not load smtp_config from settings table:', err.message);
  }

  // 1. Zoho Mail Configuration (Check DB settings first, then .env)
  const zohoUser = dbConfig?.zoho_user || process.env.ZOHO_USER;
  const zohoPass = dbConfig?.zoho_password || dbConfig?.zoho_app_password || process.env.ZOHO_PASSWORD || process.env.ZOHO_APP_PASSWORD;
  if (zohoUser && zohoPass) {
    const port = parseInt(dbConfig?.zoho_port || process.env.ZOHO_PORT || '465', 10);
    return {
      provider: 'Zoho Mail',
      host: dbConfig?.zoho_host || process.env.ZOHO_HOST || 'smtp.zoho.com',
      port: port,
      secure: port === 465,
      auth: {
        user: zohoUser.trim(),
        pass: zohoPass.trim(),
      },
      from: dbConfig?.zoho_from || process.env.ZOHO_FROM || process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || zohoUser.trim(),
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false }
    };
  }

  // 2. Generic SMTP (Hostinger Titan, cPanel, Mailgun, Amazon SES SMTP, etc.)
  const smtpHost = dbConfig?.smtp_host || process.env.SMTP_HOST;
  const smtpUser = dbConfig?.smtp_user || process.env.SMTP_USER;
  const smtpPass = dbConfig?.smtp_pass || process.env.SMTP_PASS;
  if (smtpHost && smtpUser && smtpPass) {
    const port = parseInt(dbConfig?.smtp_port || process.env.SMTP_PORT || '465', 10);
    return {
      provider: 'SMTP (' + smtpHost.trim() + ')',
      host: smtpHost.trim(),
      port: port,
      secure: dbConfig?.smtp_secure !== undefined ? dbConfig.smtp_secure : (process.env.SMTP_SECURE === 'true' || port === 465),
      auth: {
        user: smtpUser.trim(),
        pass: smtpPass.trim(),
      },
      from: dbConfig?.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || smtpUser.trim(),
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false }
    };
  }

  // 3. Gmail SMTP
  const gmailUser = dbConfig?.gmail_user || process.env.GMAIL_USER;
  const gmailPass = dbConfig?.gmail_app_password || process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    return {
      provider: 'Gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser.trim(),
        pass: gmailPass.trim(),
      },
      from: dbConfig?.smtp_from || process.env.SMTP_FROM || gmailUser.trim(),
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false }
    };
  }

  return null;
}

/**
 * Dispatch an email with multi-tier failover:
 * Tier A: SMTP (Zoho / Custom SMTP / Gmail)
 * Tier B: Resend API
 */
async function dispatchEmail({ to, subject, html, text }) {
  const recipients = Array.isArray(to) ? to : [to];
  const smtpConfig = await getSmtpConfig();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const hasResend = !!(resendApiKey && resendApiKey.length > 5);
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'reports@alrawaq.zivoxtech.com';

  const errors = [];

  // Determine priority:
  // If dedicated Zoho/SMTP is configured, try SMTP first, then Resend.
  const preferSmtpFirst = !!(smtpConfig && (smtpConfig.provider.includes('Zoho') || smtpConfig.provider.includes('SMTP')));

  if (preferSmtpFirst && smtpConfig) {
    // 1. Try Primary SMTP
    try {
      console.log(`[Email Service] Attempting delivery via ${smtpConfig.provider} to: [${recipients.join(', ')}]...`);
      const transporter = nodemailer.createTransport(smtpConfig);
      const info = await transporter.sendMail({
        from: `Al Rawaq ERP <${smtpConfig.from}>`,
        to: recipients.join(', '),
        subject: subject,
        html: html,
        text: text
      });
      console.log(`[Email Service] ✅ Successfully sent via ${smtpConfig.provider}: ${info.messageId}`);
      return { success: true, provider: smtpConfig.provider, messageId: info.messageId };
    } catch (smtpErr) {
      console.warn(`[Email Service] ⚠️ ${smtpConfig.provider} delivery failed:`, smtpErr.message);
      errors.push(`${smtpConfig.provider}: ${smtpErr.message}`);

      // If Zoho SSL on port 465 fails, attempt port 587 with STARTTLS as fallback
      if (smtpConfig.provider.includes('Zoho') && smtpConfig.port === 465) {
        try {
          console.log(`[Email Service] Retrying Zoho Mail on port 587 (STARTTLS)...`);
          const zohoTls = { ...smtpConfig, port: 587, secure: false };
          const transporter587 = nodemailer.createTransport(zohoTls);
          const info587 = await transporter587.sendMail({
            from: `Al Rawaq ERP <${smtpConfig.from}>`,
            to: recipients.join(', '),
            subject: subject,
            html: html,
            text: text
          });
          console.log(`[Email Service] ✅ Successfully sent via Zoho Mail (Port 587): ${info587.messageId}`);
          return { success: true, provider: 'Zoho Mail (Port 587)', messageId: info587.messageId };
        } catch (z587Err) {
          console.warn(`[Email Service] ⚠️ Zoho Mail (Port 587) retry failed:`, z587Err.message);
          errors.push(`Zoho Mail (Port 587): ${z587Err.message}`);
        }
      }
    }

    // 2. Fallback to Resend API
    if (hasResend) {
      try {
        console.log(`[Email Service] Falling back to Resend API for: [${recipients.join(', ')}]...`);
        const resend = new Resend(resendApiKey);
        const resendRes = await resend.emails.send({
          from: `Al Rawaq Reports <${resendFrom}>`,
          to: recipients,
          subject: subject,
          html: html
        });
        if (resendRes.error) {
          throw new Error(resendRes.error.message || JSON.stringify(resendRes.error));
        }
        console.log(`[Email Service] ✅ Successfully sent via Resend API: ${resendRes.data?.id || 'OK'}`);
        return { success: true, provider: 'Resend', messageId: resendRes.data?.id };
      } catch (resendErr) {
        console.warn(`[Email Service] ⚠️ Resend fallback failed:`, resendErr.message);
        errors.push(`Resend: ${resendErr.message}`);
      }
    }
  } else {
    // 1. Try Resend First (if configured)
    if (hasResend) {
      try {
        console.log(`[Email Service] Attempting delivery via Resend API to: [${recipients.join(', ')}]...`);
        const resend = new Resend(resendApiKey);
        const resendRes = await resend.emails.send({
          from: `Al Rawaq Reports <${resendFrom}>`,
          to: recipients,
          subject: subject,
          html: html
        });
        if (resendRes.error) {
          throw new Error(resendRes.error.message || JSON.stringify(resendRes.error));
        }
        console.log(`[Email Service] ✅ Successfully sent via Resend API: ${resendRes.data?.id || 'OK'}`);
        return { success: true, provider: 'Resend', messageId: resendRes.data?.id };
      } catch (resendErr) {
        console.warn(`[Email Service] ⚠️ Resend delivery failed (${resendErr.message}), checking SMTP fallback...`);
        errors.push(`Resend: ${resendErr.message}`);
      }
    }

    // 2. Fallback to SMTP (Zoho / Gmail / Custom SMTP)
    if (smtpConfig) {
      try {
        console.log(`[Email Service] Falling back to ${smtpConfig.provider} for: [${recipients.join(', ')}]...`);
        const transporter = nodemailer.createTransport(smtpConfig);
        const info = await transporter.sendMail({
          from: `Al Rawaq ERP <${smtpConfig.from}>`,
          to: recipients.join(', '),
          subject: subject,
          html: html,
          text: text
        });
        console.log(`[Email Service] ✅ Successfully sent via ${smtpConfig.provider}: ${info.messageId}`);
        return { success: true, provider: smtpConfig.provider, messageId: info.messageId };
      } catch (smtpErr) {
        console.warn(`[Email Service] ⚠️ ${smtpConfig.provider} fallback failed:`, smtpErr.message);
        errors.push(`${smtpConfig.provider}: ${smtpErr.message}`);
      }
    }
  }

  const finalError = errors.length > 0 
    ? errors.join(' | ') 
    : 'No active email provider configured (checked Zoho Mail, SMTP, Gmail, Resend).';

  console.error(`[Email Service] ❌ All email delivery attempts failed: ${finalError}`);
  return { success: false, error: finalError };
}

/**
 * Format shift closing HTML report, including categories, 2-hourly intervals,
 * top selling items, and a prominent revision banner if edited.
 */
function buildClosingEmailHtml(report, closingType = 'Shift', options = {}) {
  let itemsHtml = '';
  let topSellingHtml = '';
  let twoHourlyHtml = '';

  try {
    let items = [];
    if (typeof report.items_summary === 'string') {
      if (report.items_summary === '[object Object]') {
        console.warn('[Email Service] items_summary is "[object Object]", defaulting to empty array.');
      } else {
        try {
          items = JSON.parse(report.items_summary);
        } catch(parseErr) {
          console.error('[Email Service] Failed to parse items_summary string:', parseErr.message);
        }
      }
    } else if (Array.isArray(report.items_summary)) {
      items = report.items_summary;
    } else if (report.items_summary) {
      items = [report.items_summary];
    }

    // Collect all flat items to calculate top selling
    const allFlatItems = [];

    itemsHtml = items.map(cat => {
      let catHtml = `<div style="margin-bottom: 20px; background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
        <div style="background: #f8f9fa; font-weight: bold; font-size: 16px; color: #111; padding: 10px 15px; border-bottom: 1px solid #eee;">
          ${cat.category} <span style="float: right; color: #E31837; font-size: 14px;">SAR ${parseFloat(cat.amount || 0).toFixed(2)} (${cat.qty || 0} items)</span>
        </div>
        <div style="padding: 0 10px; overflow-x: auto;">
          <table style="width: 100%; min-width: 250px; border-collapse: collapse; margin: 10px 0; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
            <thead>
              <tr style="border-bottom: 1px solid #eee; text-align: left;">
                <th style="padding: 8px 4px; width: 40%;">Item</th>
                <th style="padding: 8px 4px; text-align: center; width: 15%;">Qty</th>
                <th style="padding: 8px 4px; text-align: right; width: 22%;">Price</th>
                <th style="padding: 8px 4px; text-align: right; width: 23%;">Total</th>
              </tr>
            </thead>
            <tbody>`;
      
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          const qty = parseInt(item.qty, 10) || 1;
          const amt = parseFloat(item.amount) || 0;
          const unitPrice = (amt / qty).toFixed(2);
          const totalPrice = amt.toFixed(2);
          
          allFlatItems.push({
            name: item.name,
            qty: qty,
            totalPrice: amt
          });

          catHtml += `<tr style="border-bottom: 1px dashed #f0f0f0;">
            <td style="padding: 6px 4px;">${item.name}</td>
            <td style="padding: 6px 4px; text-align: center;"><strong>${qty}</strong></td>
            <td style="padding: 6px 4px; text-align: right;">SAR ${unitPrice}</td>
            <td style="padding: 6px 4px; text-align: right;">SAR ${totalPrice}</td>
          </tr>`;
        });
      }
      
      catHtml += `</tbody></table></div></div>`;
      return catHtml;
    }).join('');

    // Calculate top 5 selling items
    if (allFlatItems.length > 0) {
      const groupedItems = {};
      allFlatItems.forEach(i => {
        if (!groupedItems[i.name]) groupedItems[i.name] = { name: i.name, qty: 0, totalPrice: 0 };
        groupedItems[i.name].qty += i.qty;
        groupedItems[i.name].totalPrice += i.totalPrice;
      });
      
      const sortedTopItems = Object.values(groupedItems).sort((a, b) => b.qty - a.qty).slice(0, 5);
      
      if (sortedTopItems.length > 0) {
        topSellingHtml = `
          <h3 style="margin-top: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Top 5 Selling Items</h3>
          <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow-x: auto;">
            <table style="width: 100%; min-width: 250px; border-collapse: collapse; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
              <thead>
                <tr style="background: #fff3f4; border-bottom: 1px solid #ffccd0; text-align: left; color: #E31837;">
                  <th style="padding: 10px 8px; width: 15%;">#</th>
                  <th style="padding: 10px 8px; width: 45%;">Item</th>
                  <th style="padding: 10px 8px; text-align: center; width: 15%;">Qty</th>
                  <th style="padding: 10px 8px; text-align: right; width: 25%;">Rev</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        sortedTopItems.forEach((item, index) => {
          topSellingHtml += `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 15px; font-weight: bold;">#${index + 1}</td>
                  <td style="padding: 8px 15px;">${item.name}</td>
                  <td style="padding: 8px 15px; text-align: center;"><strong>${item.qty}</strong></td>
                  <td style="padding: 8px 15px; text-align: right;">SAR ${item.totalPrice.toFixed(2)}</td>
                </tr>
          `;
        });
        
        topSellingHtml += `</tbody></table></div>`;
      }
    }

    // 2-Hour Intervals
    let intervalItemsObj = report.interval_items || {};
    if (typeof intervalItemsObj === 'string') {
      try { intervalItemsObj = JSON.parse(intervalItemsObj); } catch(e) { intervalItemsObj = {}; }
    }

    if (intervalItemsObj && Object.keys(intervalItemsObj).length > 0) {
      twoHourlyHtml = `
        <h3 style="margin-top: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Top Items by 2-Hour Intervals</h3>
        <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow-x: auto;">
          <table style="width: 100%; min-width: 250px; border-collapse: collapse; font-size: 13px; color: #555; table-layout: fixed; word-wrap: break-word;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 1px solid #eee; text-align: left; color: #111;">
                <th style="padding: 10px 8px; width: 35%;">Time</th>
                <th style="padding: 10px 8px; width: 65%;">Top Items (Qty)</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      const loginDate = new Date(report.login_time || Date.now());
      let maxIndex = 0;
      for (const key of Object.keys(intervalItemsObj)) {
        if (parseInt(key, 10) > maxIndex) maxIndex = parseInt(key, 10);
      }
      
      for (let i = 0; i <= maxIndex; i++) {
        const blockStartTime = new Date(loginDate.getTime() + i * 2 * 3600000);
        const blockEndTime = new Date(loginDate.getTime() + (i + 1) * 2 * 3600000);
        
        const startTimeStr = blockStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTimeStr = blockEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemsInBlock = intervalItemsObj[i] || [];
        
        let itemsList = '-';
        if (itemsInBlock.length > 0) {
          itemsList = itemsInBlock.map(item => `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed #f0f0f0;">${item.name} <strong>(${item.qty})</strong></div>`).join('');
        }
        
        twoHourlyHtml += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px 15px; font-weight: bold; border-right: 1px solid #eee;">${startTimeStr} - ${endTimeStr}</td>
            <td style="padding: 8px 15px;">${itemsList}</td>
          </tr>
        `;
      }
      
      twoHourlyHtml += `</tbody></table></div>`;
    }
  } catch(e) {
    console.error('[Email Service] Error formatting items summary for email:', e);
  }

  // Difference Banner
  const diffVal = parseFloat(report.difference || 0);
  const hasDiff = !isNaN(diffVal) && Math.abs(diffVal) >= 0.01;
  let differenceHtml = '';
  if (hasDiff) {
    const diffSign = diffVal < 0 ? '-' : '+';
    const diffLabel = diffVal < 0 ? 'SHORTAGE / کم' : 'EXCESS / زیادہ';
    differenceHtml = `
      <div style="background-color: #ffffff; border: 2px solid #dc2626; color: #111827; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
        <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; color: #dc2626;">
          DIFFERENCE: ${diffSign}SAR ${Math.abs(diffVal).toFixed(2)} (${diffLabel})
        </div>
        ${report.difference_reason ? `
          <div style="margin-top: 10px; font-size: 14px; border-top: 1px dashed #d1d5db; padding-top: 8px; color: #374151; text-align: left; line-height: 1.4;">
            <strong style="color: #111827;">Reason:</strong> ${report.difference_reason}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Daily Shifts Summary Table (for Daily closing)
  let shiftsHtml = '';
  if (closingType === 'Daily') {
    let shiftsArr = [];
    if (typeof report.shifts_summary === 'string') {
      try { shiftsArr = JSON.parse(report.shifts_summary); } catch (e) { shiftsArr = []; }
    } else if (Array.isArray(report.shifts_summary)) {
      shiftsArr = report.shifts_summary;
    }

    const totalDailySysCash = parseFloat(report.cash_sales || 0);
    const totalDailySysCard = parseFloat(report.card_sales || 0);
    const totalDailySysCredit = parseFloat(report.credit_sales || 0);
    const totalDailySysMajor = parseFloat(report.major_payments || 0);

    const night = shiftsArr && shiftsArr.length > 0 ? shiftsArr[0] : null;
    const dayFromShifts = shiftsArr && shiftsArr.length > 1 ? shiftsArr[1] : null;

    const nightCashier = night?.cashier_name || '';
    let dayCashier = dayFromShifts?.cashier_name || '';
    if (!dayCashier) {
      if (!night) {
        dayCashier = report.cashier_name || '';
      } else if (shiftsArr.length === 1 && !nightCashier.toLowerCase().includes((report.cashier_name || '').toLowerCase())) {
        dayCashier = report.cashier_name || '';
      }
    }

    const nightSysCash = parseFloat(night?.cash_sales || 0);
    const nightActCash = night?.closing_cash !== null && night?.closing_cash !== undefined 
      ? parseFloat(night.closing_cash) 
      : (night ? nightSysCash : 0);

    const nightSysCard = parseFloat(night?.card_sales || 0);
    const nightActCard = night?.closing_card !== null && night?.closing_card !== undefined 
      ? parseFloat(night.closing_card) 
      : (night ? nightSysCard : 0);

    const nightSysCredit = parseFloat(night?.credit_sales || 0);
    const nightActCredit = nightSysCredit;

    const nightSysMajor = parseFloat(night?.major_payments || 0);
    const nightActMajor = nightSysMajor;

    const nightCashDiff = nightActCash - nightSysCash;
    const nightCardDiff = nightActCard - nightSysCard;
    const nightDiff = night ? (night.difference !== null && night.difference !== undefined ? parseFloat(night.difference) : (nightCashDiff + nightCardDiff)) : 0;

    const daySysCash = dayFromShifts 
      ? parseFloat(dayFromShifts.cash_sales || 0) 
      : Math.max(0, totalDailySysCash - nightSysCash);

    const daySysCard = dayFromShifts 
      ? parseFloat(dayFromShifts.card_sales || 0) 
      : Math.max(0, totalDailySysCard - nightSysCard);

    let daySysCredit = dayFromShifts 
      ? parseFloat(dayFromShifts.credit_sales || 0) 
      : Math.max(0, totalDailySysCredit - nightSysCredit);
    if (daySysCredit === 0 || (nightSysCredit + daySysCredit) < totalDailySysCredit) {
      daySysCredit = Math.max(daySysCredit, totalDailySysCredit - nightSysCredit);
    }
    const dayActCredit = daySysCredit;

    let daySysMajor = dayFromShifts 
      ? parseFloat(dayFromShifts.major_payments || 0) 
      : Math.max(0, totalDailySysMajor - nightSysMajor);
    if (daySysMajor === 0 || (nightSysMajor + daySysMajor) < totalDailySysMajor) {
      daySysMajor = Math.max(daySysMajor, totalDailySysMajor - nightSysMajor);
    }
    const dayActMajor = daySysMajor;

    let dayActCash = 0;
    let dayActCard = 0;
    if (dayFromShifts && dayFromShifts.closing_cash !== null && dayFromShifts.closing_cash !== undefined) {
      dayActCash = parseFloat(dayFromShifts.closing_cash);
      dayActCard = parseFloat(dayFromShifts.closing_card !== null && dayFromShifts.closing_card !== undefined ? dayFromShifts.closing_card : (dayFromShifts.card_sales || 0));
    } else if (report.closing_cash !== null && report.closing_cash !== undefined) {
      const repClosingCash = parseFloat(report.closing_cash || 0);
      dayActCash = Math.abs(repClosingCash - (nightActCash + daySysCash)) < Math.abs(repClosingCash - daySysCash)
        ? Math.max(0, repClosingCash - nightActCash)
        : repClosingCash;
      const repClosingCard = parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0));
      dayActCard = Math.abs(repClosingCard - (nightActCard + daySysCard)) < Math.abs(repClosingCard - daySysCard)
        ? Math.max(0, repClosingCard - nightActCard)
        : repClosingCard;
    } else {
      dayActCash = daySysCash;
      dayActCard = daySysCard;
    }

    const dayCashDiff = dayActCash - daySysCash;
    const dayCardDiff = dayActCard - daySysCard;
    const dayDiff = dayFromShifts 
      ? (dayFromShifts.difference !== null && dayFromShifts.difference !== undefined ? parseFloat(dayFromShifts.difference) : (dayCashDiff + dayCardDiff)) 
      : (dayCashDiff + dayCardDiff);

    const totalSysCash = Math.max(totalDailySysCash, nightSysCash + daySysCash);
    let totalActCash = nightActCash + dayActCash;
    if (report.closing_cash !== null && report.closing_cash !== undefined) {
      totalActCash = parseFloat(report.closing_cash || 0);
    }

    const totalSysCard = Math.max(totalDailySysCard, nightSysCard + daySysCard);
    let totalActCard = nightActCard + dayActCard;
    if (report.closing_card !== null && report.closing_card !== undefined) {
      totalActCard = parseFloat(report.closing_card || 0);
    }

    const totalSysCredit = Math.max(totalDailySysCredit, nightSysCredit + daySysCredit);
    const totalActCredit = totalSysCredit;

    const totalSysMajor = Math.max(totalDailySysMajor, nightSysMajor + daySysMajor);
    const totalActMajor = totalSysMajor;

    const totalCashDiff = totalActCash - totalSysCash;
    const totalCardDiff = totalActCard - totalSysCard;
    const totalDiffVal = report.difference !== null && report.difference !== undefined 
      ? parseFloat(report.difference) 
      : (totalCashDiff + totalCardDiff);

    const fmtDiff = (d) => {
      if (d === null || d === undefined || isNaN(d) || Math.abs(d) < 0.005) return '0.00';
      return d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2);
    };

    shiftsHtml = `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
          Daily summary: day + night
        </h3>
        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow-x: auto;">
          <table style="width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1;">
                <th style="padding: 10px 12px; text-align: left; font-weight: 700; color: #475569;"></th>
                <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                  Night<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">System</span>
                  ${nightCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${nightCashier}</div>` : ''}
                </th>
                <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                  Night<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">Actual</span>
                  ${nightCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${nightCashier}</div>` : ''}
                </th>
                <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                  Day<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">System</span>
                  ${dayCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${dayCashier}</div>` : ''}
                </th>
                <th style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0f172a;">
                  Day<br><span style="font-weight: 600; font-size: 11px; color: #64748b;">Actual</span>
                  ${dayCashier ? `<div style="font-size: 10px; font-weight: normal; color: #94a3b8;">${dayCashier}</div>` : ''}
                </th>
                <th style="padding: 10px 12px; text-align: right; font-weight: 900; color: #0f172a; font-size: 13.5px;">
                  Total<br><span style="font-weight: 700; font-size: 11px; color: #64748b;">System</span>
                </th>
                <th style="padding: 10px 12px; text-align: right; font-weight: 900; color: #0f172a; font-size: 13.5px;">
                  Total<br><span style="font-weight: 700; font-size: 11px; color: #64748b;">Actual</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Cash sale</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCash.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${nightActCash.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCash.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${dayActCash.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCash.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCash.toFixed(2)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Card / Bank sale</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCard.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${nightActCard.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCard.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${dayActCard.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCard.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCard.toFixed(2)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Credit sale</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysCredit.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightActCredit.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysCredit.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${dayActCredit.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysCredit.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActCredit.toFixed(2)}</td>
              </tr>
              <tr style="border-bottom: 1.5px solid #cbd5e1;">
                <td style="padding: 8px 12px; font-weight: 600; color: #1e293b;">Major Payments</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightSysMajor.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${nightActMajor.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${daySysMajor.toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #334155;">${dayActMajor.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${totalSysMajor.toFixed(2)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 900; color: #0f172a;">${totalActMajor.toFixed(2)}</td>
              </tr>
              <tr style="background: #f8fafc; font-weight: 800;">
                <td style="padding: 10px 12px; color: #0f172a;">Difference</td>
                <td style="padding: 10px 10px; text-align: right;"></td>
                <td style="padding: 10px 10px; text-align: right; color: ${nightDiff < 0 ? '#b91c1c' : (nightDiff > 0 ? '#15803d' : '#0f172a')};">
                  ${fmtDiff(nightDiff)}
                </td>
                <td style="padding: 10px 10px; text-align: right;"></td>
                <td style="padding: 10px 10px; text-align: right; color: ${dayDiff < 0 ? '#b91c1c' : (dayDiff > 0 ? '#15803d' : '#0f172a')};">
                  ${fmtDiff(dayDiff)}
                </td>
                <td style="padding: 10px 12px; text-align: right;"></td>
                <td style="padding: 10px 12px; text-align: right; font-size: 14px; color: ${totalDiffVal < 0 ? '#b91c1c' : (totalDiffVal > 0 ? '#15803d' : '#0f172a')};">
                  ${fmtDiff(totalDiffVal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 6px; font-size: 11.5px; color: #64748b; font-weight: 600; text-align: right;">
          Cash Diff: <strong style="color: ${totalCashDiff < 0 ? '#b91c1c' : '#047857'}">${fmtDiff(totalCashDiff)}</strong> &nbsp;|&nbsp; 
          Card Diff: <strong style="color: ${totalCardDiff < 0 ? '#b91c1c' : '#2563eb'}">${fmtDiff(totalCardDiff)}</strong> &nbsp;|&nbsp; 
          Total Diff: <strong style="color: ${totalDiffVal < 0 ? '#b91c1c' : '#0f172a'}">${fmtDiff(totalDiffVal)}</strong>
        </div>
      </div>
    `;
  }

  // Revision Audit Banner (when edited)
  let revisionHtml = '';
  if (options.isEdited) {
    const prevCashFmt = options.previousCash !== null && options.previousCash !== undefined ? parseFloat(options.previousCash).toFixed(2) : '-';
    const newCashFmt = options.newCash !== null && options.newCash !== undefined ? parseFloat(options.newCash).toFixed(2) : '-';
    const prevCardFmt = options.previousCard !== null && options.previousCard !== undefined ? parseFloat(options.previousCard).toFixed(2) : '-';
    const newCardFmt = options.newCard !== null && options.newCard !== undefined ? parseFloat(options.newCard).toFixed(2) : '-';
    const prevDiffFmt = options.previousDiff !== null && options.previousDiff !== undefined 
      ? (parseFloat(options.previousDiff) > 0 ? `+${parseFloat(options.previousDiff).toFixed(2)}` : parseFloat(options.previousDiff).toFixed(2)) 
      : '-';
    const newDiffFmt = options.newDiff !== null && options.newDiff !== undefined 
      ? (parseFloat(options.newDiff) > 0 ? `+${parseFloat(options.newDiff).toFixed(2)}` : parseFloat(options.newDiff).toFixed(2)) 
      : '-';

    const editorDisplay = `${options.editorRole ? options.editorRole + ' ' : ''}${options.editorName || 'Authorized User'}`;
    const editTimeKsa = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' });

    revisionHtml = `
      <div style="background-color: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: 800; color: #b45309; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
          ⚠️ Shift Closing Record Revised / Updated
        </div>
        <div style="font-size: 13px; color: #78350f; margin-bottom: 12px; line-height: 1.4;">
          This closing record was revised by <strong>${editorDisplay}</strong> on <strong>${editTimeKsa} (KSA)</strong>.
        </div>
        <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #fde68a; border-radius: 6px; font-size: 13px; margin-bottom: 10px;">
          <thead>
            <tr style="background: #fef3c7; border-bottom: 1px solid #fde68a; text-align: left;">
              <th style="padding: 8px 10px; color: #92400e;">Field</th>
              <th style="padding: 8px 10px; color: #92400e; text-align: right;">Previous</th>
              <th style="padding: 8px 10px; color: #92400e; text-align: right;">Revised</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px dashed #fde68a;">
              <td style="padding: 7px 10px; font-weight: 600; color: #374151;">Actual Cash Counted</td>
              <td style="padding: 7px 10px; text-align: right; color: #6b7280;">SAR ${prevCashFmt}</td>
              <td style="padding: 7px 10px; text-align: right; font-weight: 700; color: #047857;">SAR ${newCashFmt}</td>
            </tr>
            <tr style="border-bottom: 1px dashed #fde68a;">
              <td style="padding: 7px 10px; font-weight: 600; color: #374151;">Actual Card Counted</td>
              <td style="padding: 7px 10px; text-align: right; color: #6b7280;">SAR ${prevCardFmt}</td>
              <td style="padding: 7px 10px; text-align: right; font-weight: 700; color: #2563eb;">SAR ${newCardFmt}</td>
            </tr>
            <tr>
              <td style="padding: 7px 10px; font-weight: 600; color: #374151;">Difference</td>
              <td style="padding: 7px 10px; text-align: right; color: #6b7280;">SAR ${prevDiffFmt}</td>
              <td style="padding: 7px 10px; text-align: right; font-weight: 800; color: ${parseFloat(newDiffFmt) < 0 ? '#b91c1c' : '#047857'};">SAR ${newDiffFmt}</td>
            </tr>
          </tbody>
        </table>
        ${options.reason ? `
          <div style="background: #ffffff; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #78350f;">
            <strong>Reason for Edit:</strong> ${options.reason}
          </div>
        ` : ''}
      </div>
    `;
  }

  const subject = options.isEdited
    ? `[REVISED] Shift Closing Report - ${report.branch || 'Branch'} (Edited by ${options.editorName || 'Admin'})`
    : `${closingType} Closing Report - ${report.branch || 'Branch'}`;

  const headerBg = options.isEdited ? '#b45309' : '#E31837';
  const headerTitle = options.isEdited ? `[REVISED] ${closingType} Closing Report` : `${closingType} Closing Report`;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden; background: #fafafa; box-sizing: border-box;">
      <div style="background-color: ${headerBg}; padding: 20px; border-bottom: 1px solid #eaeaea; text-align: center; color: white;">
        <h2 style="margin: 0; font-size: 22px;">${headerTitle}</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">${report.branch || 'Branch'}</p>
      </div>
      <div style="padding: 24px;">
        ${revisionHtml}
        ${differenceHtml}
        ${shiftsHtml}
        <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 20px;">
          <p style="margin: 4px 0;"><strong>Cashier:</strong> ${report.cashier_name || '-'}</p>
          <p style="margin: 4px 0;"><strong>Total Orders:</strong> ${report.total_orders || 0}</p>
          <p style="margin: 4px 0;"><strong>Total Sales:</strong> SAR ${parseFloat(report.total_sales || 0).toFixed(2)}</p>
          <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Cash Sales: SAR ${parseFloat(report.cash_sales || 0).toFixed(2)}</p>
          <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Card Sales: SAR ${parseFloat(report.card_sales || 0).toFixed(2)}</p>
          <p style="margin: 4px 0; padding-left: 10px; font-size: 13px; color: #555;">↳ Credit Sales: SAR ${parseFloat(report.credit_sales || 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Major Payments Received:</strong> SAR ${parseFloat(report.major_payments || 0).toFixed(2)}</p>
          <p style="margin: 4px 0; font-weight: bold; color: #059669;"><strong>Total Amount Received:</strong> SAR ${(parseFloat(report.cash_sales || 0) + parseFloat(report.card_sales || 0) + parseFloat(report.major_payments || 0)).toFixed(2)}</p>
          ${parseFloat(report.opening_cash || 0) > 0 ? `<p style="margin: 4px 0;"><strong>Opening Drawer Cash:</strong> SAR ${parseFloat(report.opening_cash).toFixed(2)}</p>` : ''}
          <p style="margin: 4px 0; color: #047857;"><strong>Cash Counted:</strong> SAR ${parseFloat(report.closing_cash || 0).toFixed(2)}</p>
          <p style="margin: 4px 0; color: #2563eb;"><strong>Card Counted:</strong> SAR ${parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0)).toFixed(2)}</p>
          <p style="margin: 4px 0; font-weight: bold;"><strong>Total Counted:</strong> SAR ${(parseFloat(report.closing_cash || 0) + parseFloat(report.closing_card !== null && report.closing_card !== undefined ? report.closing_card : (report.card_sales || 0))).toFixed(2)}</p>
          ${hasDiff ? `<p style="margin: 4px 0; color: #dc2626; font-weight: bold;"><strong>Difference:</strong> ${diffVal < 0 ? '-' : '+'}SAR ${Math.abs(diffVal).toFixed(2)}</p>` : ''}
          ${report.cash_difference !== null && report.cash_difference !== undefined ? `<p style="margin: 2px 0 2px 10px; font-size: 12px; color: ${parseFloat(report.cash_difference) < 0 ? '#dc2626' : '#047857'};">↳ Cash Diff: ${parseFloat(report.cash_difference) < 0 ? '-' : '+'}SAR ${Math.abs(parseFloat(report.cash_difference)).toFixed(2)}</p>` : ''}
          ${report.card_difference !== null && report.card_difference !== undefined ? `<p style="margin: 2px 0 2px 10px; font-size: 12px; color: ${parseFloat(report.card_difference) < 0 ? '#dc2626' : '#2563eb'};">↳ Card Diff: ${parseFloat(report.card_difference) < 0 ? '-' : '+'}SAR ${Math.abs(parseFloat(report.card_difference)).toFixed(2)}</p>` : ''}
          ${hasDiff && report.difference_reason ? `<p style="margin: 4px 0; color: #374151;"><strong>Diff Reason:</strong> ${report.difference_reason}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Active Time:</strong> ${report.total_active_time || '-'}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #777;">${report.login_time ? new Date(report.login_time).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }) : '-'} - ${report.logout_time ? new Date(report.logout_time).toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }) : '-'} (KSA)</p>
        </div>
        
        <h3 style="margin-top: 24px; border-bottom: 2px solid #eaeaea; padding-bottom: 8px; color: #333;">Items Sold by Category</h3>
        <div>${itemsHtml || '<p style="text-align:center; color:#999; padding: 20px;">No items sold</p>'}</div>
        
        ${twoHourlyHtml}
        ${topSellingHtml}
      </div>
    </div>
  `;

  return { subject, htmlContent };
}

/**
 * Main function to send shift closing or daily closing report email.
 * Includes deduplication, recipient resolution, and robust multi-provider delivery.
 */
async function sendClosingEmail(report, closingType = 'Shift', options = {}) {
  try {
    if (!report || !report.id) {
      console.warn('[Email Service] Skipping sendClosingEmail: No valid report or report ID provided.');
      return { success: false, error: 'No valid report provided' };
    }

    // 1. Anti-spam deduplication check (30-second TTL unless options.force is true)
    const dedupeKey = options.isEdited
      ? `edit_${report.id}_${report.closing_cash}_${report.closing_card}`
      : `close_${report.id}_${closingType}`;
    
    const now = Date.now();
    if (!options.force && emailDedupeMap.has(dedupeKey)) {
      const lastSent = emailDedupeMap.get(dedupeKey);
      if (now - lastSent < 30000) {
        console.log(`[Email Service] ℹ️ Cooldown active: Skipping duplicate email for key [${dedupeKey}]`);
        return { success: true, deduplicated: true, message: 'Duplicate email prevented by cooldown' };
      }
    }
    // Set timestamp early to guard against rapid concurrent clicks
    emailDedupeMap.set(dedupeKey, now);

    // 2. Resolve recipients from settings or .env
    const toEmails = await getRecipientEmails();
    if (!toEmails || toEmails.length === 0) {
      emailDedupeMap.delete(dedupeKey);
      console.warn('[Email Service] ⚠️ Skipping: No recipient emails configured in Settings or .env');
      return { success: false, error: 'No recipient emails configured in Settings or .env' };
    }

    // 3. Build email content
    const { subject, htmlContent } = buildClosingEmailHtml(report, closingType, options);

    // 4. Dispatch email via multi-provider failover
    const result = await dispatchEmail({
      to: toEmails,
      subject: subject,
      html: htmlContent
    });

    if (result.success) {
      return { success: true, provider: result.provider, recipients: toEmails, messageId: result.messageId };
    } else {
      // Allow retry after failure
      emailDedupeMap.delete(dedupeKey);
      return { success: false, error: result.error, recipients: toEmails };
    }
  } catch (err) {
    console.error('[Email Service] Unexpected error in sendClosingEmail:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendClosingEmail,
  getRecipientEmails,
  dispatchEmail,
  buildClosingEmailHtml,
  getSmtpConfig
};
