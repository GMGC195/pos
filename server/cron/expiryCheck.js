const cron = require('node-cron');
const pool = require('../db');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Helper to send email to admins and/or employees
async function sendExpiryEmail(employeeName, documentName, expiryDateStr, diffDays, recipients) {
  const validRecipients = (recipients || []).filter(email => email && typeof email === 'string' && email.includes('@'));
  if (validRecipients.length === 0) {
    console.log(`No valid email recipients for ${employeeName} - ${documentName}, skipping email.`);
    return;
  }

  const isExpired = diffDays < 0;
  const isToday = diffDays === 0;
  const statusText = isExpired
    ? `expired ${Math.abs(diffDays)} day(s) ago`
    : isToday
      ? `expires today`
      : `will expire in ${diffDays} day(s)`;

  const subject = `🚨 Document Expiry Alert: ${documentName} (${employeeName})`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #ef4444; margin: 0; font-size: 20px;">⚠️ Document Expiry Alert</h2>
      </div>
      <p style="color: #374151; font-size: 15px; line-height: 1.5;">
        This is an automated notification that the document <strong>${documentName}</strong> for employee <strong>${employeeName}</strong> ${statusText}.
      </p>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; width: 130px;">Employee:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600;">${employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Document:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600;">${documentName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Expiry Date:</td>
            <td style="padding: 6px 0; color: #ef4444; font-weight: 600;">${expiryDateStr}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Status:</td>
            <td style="padding: 6px 0; color: #ef4444; font-weight: 600;">
              ${isExpired ? `Expired (${Math.abs(diffDays)} days ago)` : isToday ? `Expires Today` : `${diffDays} days remaining`}
            </td>
          </tr>
        </table>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin: 0;">
        Please ensure necessary document renewal action is taken promptly in the Employee Management portal.
      </p>
    </div>
  `;

  // 1. Try Resend first if credentials exist
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: `Pizza Shop Document Alerts <${process.env.RESEND_FROM_EMAIL}>`,
        to: validRecipients,
        subject: subject,
        html: html
      });
      console.log(`✅ [Resend] Expiry email sent to [${validRecipients.join(', ')}] for ${employeeName} - ${documentName}`);
      return;
    } catch (resendErr) {
      console.warn(`⚠️ [Resend] Failed, falling back to Nodemailer:`, resendErr.message);
    }
  }

  // 2. Fallback to Nodemailer
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
        tls: { rejectUnauthorized: false }
      });

      await transporter.sendMail({
        from: `"Pizza Shop Document Alerts" <${process.env.GMAIL_USER}>`,
        to: validRecipients.join(', '),
        subject: subject,
        html: html
      });
      console.log(`✅ [Nodemailer] Expiry email sent to [${validRecipients.join(', ')}] for ${employeeName} - ${documentName}`);
    } catch (nodemailerErr) {
      console.error('❌ Failed to send expiry email via Nodemailer:', nodemailerErr.message);
    }
  } else {
    console.log('No email service available to send expiry email.');
  }
}

// Function to check expiries
async function checkExpiries() {
  console.log('--- Running Daily Expiry Check ---');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Gather all active employees
    const employeesRes = await pool.query(
      "SELECT id, employee_id, name, iqama_expiry, baladiya_card_expiry, insurance_expiry FROM employees WHERE status = 'Active'"
    );

    // 2. Gather all uploaded employee_documents for active employees
    const documentsRes = await pool.query(`
      SELECT ed.id, ed.document_name, ed.document_type, ed.document_number, ed.expiry_date, ed.employee_id, e.name as employee_name 
      FROM employee_documents ed 
      JOIN employees e ON ed.employee_id = e.id 
      WHERE ed.expiry_date IS NOT NULL AND e.status = 'Active'
    `);

    // Prepare list of admin emails
    const adminEmails = [
      process.env.SUPPORT_EMAIL,
      process.env.REPORT_TO_EMAILS
    ]
      .filter(Boolean)
      .flatMap(e => e.split(','))
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));

    // Cache employee user mapping: employee.id -> { userId, email }
    const userMap = {};
    const allUsers = await pool.query("SELECT id, email, username, employee_id FROM users");
    for (const u of allUsers.rows) {
      if (u.employee_id) {
        userMap[u.employee_id] = { id: u.id, email: u.email };
      }
      if (u.username) {
        userMap[u.username.toLowerCase()] = { id: u.id, email: u.email };
      }
    }

    // Helper to get user info for an employee
    const getEmployeeUser = (empId, empName) => {
      if (empId && userMap[empId]) return userMap[empId];
      if (empName && userMap[empName.toLowerCase()]) return userMap[empName.toLowerCase()];
      return null;
    };

    // Combine documents into a unified list to evaluate
    const allDocItems = [];

    // From employees table columns
    for (const emp of employeesRes.rows) {
      const user = getEmployeeUser(emp.id, emp.name);
      if (emp.iqama_expiry) {
        allDocItems.push({
          employeeId: emp.id,
          employeeName: emp.name,
          docKey: `iqama-${emp.id}`,
          docName: 'Iqama',
          expiry: emp.iqama_expiry,
          userId: user?.id || null,
          userEmail: user?.email || null
        });
      }
      if (emp.baladiya_card_expiry) {
        allDocItems.push({
          employeeId: emp.id,
          employeeName: emp.name,
          docKey: `baladiya-${emp.id}`,
          docName: 'Baladiya Card',
          expiry: emp.baladiya_card_expiry,
          userId: user?.id || null,
          userEmail: user?.email || null
        });
      }
      if (emp.insurance_expiry) {
        allDocItems.push({
          employeeId: emp.id,
          employeeName: emp.name,
          docKey: `insurance-${emp.id}`,
          docName: 'Insurance',
          expiry: emp.insurance_expiry,
          userId: user?.id || null,
          userEmail: user?.email || null
        });
      }
    }

    // From employee_documents table
    for (const doc of documentsRes.rows) {
      const user = getEmployeeUser(doc.employee_id, doc.employee_name);
      allDocItems.push({
        employeeId: doc.employee_id,
        employeeName: doc.employee_name,
        docKey: `doc-${doc.id}`,
        docName: doc.document_name ? `${doc.document_type || 'Doc'}: ${doc.document_name}` : (doc.document_type || 'Document'),
        expiry: doc.expiry_date,
        userId: user?.id || null,
        userEmail: user?.email || null
      });
    }

    // Evaluate each document
    for (const item of allDocItems) {
      if (!item.expiry) continue;
      const expiryDate = new Date(item.expiry);
      if (isNaN(expiryDate.getTime())) continue;

      expiryDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

      // Rule schedule:
      // 1 month before (30 days): Top bar notification (Admin + Employee), Email (Admin + Employee)
      // 1 week after that (~23, 16 days): Top bar notification (Admin + Employee), Email (Admin)
      // 1 week before (7 days) down to expiry / expired (diffDays <= 7 && diffDays >= -7):
      // Daily: Top bar notification (Admin + Employee), Email (Admin only - employee only gets top bar)
      let shouldNotifyTopBar = false;
      let shouldEmailAdmin = false;
      let shouldEmailEmployee = false;

      if (diffDays === 30) {
        shouldNotifyTopBar = true;
        shouldEmailAdmin = true;
        shouldEmailEmployee = true;
      } else if (diffDays === 23 || diffDays === 16) {
        // Intermediate reminder after a week
        shouldNotifyTopBar = true;
        shouldEmailAdmin = true;
        shouldEmailEmployee = false;
      } else if (diffDays <= 7 && diffDays >= -7) {
        // Daily in the final 7 days leading to expiry, on the day of expiry, and up to 7 days expired
        shouldNotifyTopBar = true;
        shouldEmailAdmin = true;
        shouldEmailEmployee = false; // Employee only receives top bar notification daily
      }

      if (!shouldNotifyTopBar && !shouldEmailAdmin && !shouldEmailEmployee) {
        continue;
      }

      const expiryDateStr = expiryDate.toLocaleDateString();
      const message = diffDays < 0
        ? `${item.docName} for ${item.employeeName} expired ${Math.abs(diffDays)} day(s) ago (${expiryDateStr}).`
        : diffDays === 0
          ? `${item.docName} for ${item.employeeName} expires today (${expiryDateStr})!`
          : `${item.docName} for ${item.employeeName} expires in ${diffDays} day(s) (${expiryDateStr}).`;

      // Check for duplicate notification sent today to prevent spamming on multiple checks/restarts
      const duplicateCheck = await pool.query(
        `SELECT id FROM notifications 
         WHERE type = 'expiry_alert' 
           AND message = $1 
           AND created_at >= CURRENT_DATE`,
        [message]
      );

      if (duplicateCheck.rows.length > 0) {
        // Already processed today
        continue;
      }

      if (shouldNotifyTopBar) {
        const target_roles = JSON.stringify(['admin', 'developer', 'management']);
        const target_users = item.userId ? JSON.stringify([item.userId, String(item.userId)]) : '[]';

        await pool.query(
          "INSERT INTO notifications (target_roles, target_users, type, message) VALUES ($1, $2, 'expiry_alert', $3)",
          [target_roles, target_users, message]
        );
        console.log(`🔔 Expiry notification created for ${item.employeeName} - ${item.docName} (${diffDays} days)`);
      }

      // Collect email recipients
      const emailRecipients = [];
      if (shouldEmailAdmin) {
        emailRecipients.push(...adminEmails);
      }
      if (shouldEmailEmployee && item.userEmail) {
        emailRecipients.push(item.userEmail);
      }

      const uniqueRecipients = [...new Set(emailRecipients.map(e => e.trim().toLowerCase()))];
      if (uniqueRecipients.length > 0) {
        await sendExpiryEmail(item.employeeName, item.docName, expiryDateStr, diffDays, uniqueRecipients);
      }
    }
  } catch (err) {
    console.error('Error during expiry check:', err);
  }
}

function initCron() {
  // Run every day at midnight (00:00)
  cron.schedule('0 0 * * *', () => {
    checkExpiries();
  });
  console.log('✅ Daily expiry check cron initialized (00:00)');
  
  // Also run a check 5 seconds after server startup
  setTimeout(() => {
    checkExpiries();
  }, 5000);
}

module.exports = { initCron, checkExpiries };
