const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// POST /api/support/send
router.post('/send', async (req, res) => {
  const { name, email, reason, screenshot, phone } = req.body;

  console.log('--- Support Request Received ---');
  console.log('From:', name, `(${email})`);
  console.log('Phone:', phone);

  if (!name || !email || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Basic validation of env vars
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUPPORT_EMAIL) {
      throw new Error('Server email configuration is missing in .env');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for 587
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false // Helps in some environments
      }
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.SUPPORT_EMAIL,
      subject: `🍕 Support: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nReason: ${reason}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #E31837;">New Support Request</h2>
          <p><strong>Customer Name:</strong> ${name}</p>
          <p><strong>Customer Email:</strong> ${email}</p>
          <p><strong>Phone Number:</strong> ${phone || 'Not Provided'}</p>
          <hr />
          <p><strong>Problem / Reason:</strong></p>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #E31837; white-space: pre-wrap;">
            ${reason}
          </div>
          ${screenshot ? `<p><br/><strong>A screenshot was attached to this request.</strong></p>` : ''}
          <p style="font-size: 11px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            Sent from Pizza Shop Management System
          </p>
        </div>
      `,
      attachments: screenshot && typeof screenshot === 'string' && screenshot.includes('base64,') ? [
        {
          filename: 'customer-screenshot.png',
          content: screenshot.split('base64,')[1],
          encoding: 'base64'
        }
      ] : []
    };

    console.log('Attempting to send email via Nodemailer...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);

    res.json({ success: true, message: 'Support request sent successfully' });
  } catch (error) {
    console.error('❌ Support Email Error:', error);
    // Log more specific details if available
    if (error.code) console.error('Error Code:', error.code);
    if (error.command) console.error('Last SMTP Command:', error.command);
    
    res.status(500).json({ 
      error: 'Failed to send support request. Internal Server Error.',
      details: error.message 
    });
  }
});

module.exports = router;
