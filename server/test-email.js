require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('--- Email Diagnostic Test ---');
  console.log('GMAIL_USER:', process.env.GMAIL_USER);
  console.log('SUPPORT_EMAIL:', process.env.SUPPORT_EMAIL);
  console.log('App Password length:', process.env.GMAIL_APP_PASSWORD ? process.env.GMAIL_APP_PASSWORD.length : 0);

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUPPORT_EMAIL) {
    console.error('❌ Missing environment variables!');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('✅ Transporter is ready to take our messages');

    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.SUPPORT_EMAIL,
      subject: '🍕 Pizza Shop: Diagnostic Test',
      text: 'This is a test email to verify nodemailer configuration.',
    });
    console.log('✅ Test email sent:', info.messageId);
  } catch (error) {
    console.error('❌ Diagnostic Failed:');
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Error Command:', error.command);
    console.error('Error Response:', error.response);
    console.error('Full Error:', error);
  }
}

testEmail();
