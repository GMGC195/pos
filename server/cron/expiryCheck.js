const cron = require('node-cron');
const pool = require('../db');
const nodemailer = require('nodemailer');

// Helper to send email
async function sendExpiryEmail(employeeName, documentName, expiryDateStr) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUPPORT_EMAIL) {
    console.log('Email configuration missing, skipping expiry email.');
    return;
  }

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

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.SUPPORT_EMAIL,
      subject: `🚨 Document Expiry Alert: ${employeeName}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #E31837;">Document Expiry Alert</h2>
          <p><strong>Employee:</strong> ${employeeName}</p>
          <p><strong>Document:</strong> ${documentName}</p>
          <p><strong>Expiry Date:</strong> ${expiryDateStr}</p>
          <p>This document will expire in exactly 7 days. Please take action immediately.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Expiry email sent for ${employeeName} - ${documentName}`);
  } catch (error) {
    console.error('❌ Failed to send expiry email:', error.message);
  }
}

// Function to check expiries
async function checkExpiries() {
  console.log('--- Running Daily Expiry Check ---');
  try {
    const employees = await pool.query(
      "SELECT id, employee_id, name, iqama_expiry, baladiya_card_expiry, insurance_expiry FROM employees WHERE status = 'Active'"
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const emp of employees.rows) {
      // We need the user_id for the employee to send the notification specifically to them
      let empUserId = null;
      const userRes = await pool.query("SELECT id FROM users WHERE employee_id = $1 OR LOWER(username) = LOWER($2)", [emp.id, emp.name]);
      if (userRes.rows.length > 0) {
        empUserId = userRes.rows[0].id;
      }

      const docs = [
        { name: 'Iqama', expiry: emp.iqama_expiry },
        { name: 'Baladiya Card', expiry: emp.baladiya_card_expiry },
        { name: 'Insurance', expiry: emp.insurance_expiry }
      ];

      for (const doc of docs) {
        if (!doc.expiry) continue;

        const expiryDate = new Date(doc.expiry);
        // ignore invalid dates
        if (isNaN(expiryDate.getTime())) continue;

        expiryDate.setHours(0, 0, 0, 0);
        
        const diffTime = Math.abs(expiryDate - today);
        const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)); 
        // e.g. if expiry is tomorrow, diffDays = 1

        let shouldNotify = false;
        let shouldEmail = false;

        if (diffDays === 30) {
          shouldNotify = true;
          shouldEmail = true;
        } else if (diffDays === 23 || diffDays === 16 || diffDays === 9) {
          shouldNotify = true;
        } else if (diffDays === 7) {
          shouldNotify = true;
          shouldEmail = true;
        } else if (diffDays < 7 && diffDays > 0) {
          shouldNotify = true;
        }

        if (shouldNotify) {
          const message = `${doc.name} for ${emp.name} expires in ${diffDays} days (${expiryDate.toLocaleDateString()}).`;
          
          // target_roles: admin, developer
          // target_users: employee
          const target_roles = JSON.stringify(['admin', 'developer', 'management']);
          const target_users = empUserId ? JSON.stringify([empUserId]) : '[]';

          await pool.query(
            "INSERT INTO notifications (target_roles, target_users, type, message) VALUES ($1, $2, 'expiry_alert', $3)",
            [target_roles, target_users, message]
          );
        }

        if (shouldEmail) {
          await sendExpiryEmail(emp.name, doc.name, expiryDate.toLocaleDateString());
        }
      }
    }
  } catch (err) {
    console.error('Error during expiry check:', err);
  }
}

function initCron() {
  // Run every day at midnight
  cron.schedule('0 0 * * *', () => {
    checkExpiries();
  });
  console.log('✅ Daily expiry check cron initialized');
}

module.exports = { initCron, checkExpiries };
