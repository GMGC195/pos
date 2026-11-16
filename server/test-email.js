const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const { sendClosingEmail, getRecipientEmails, getSmtpConfig, dispatchEmail } = require('./utils/emailService');

async function testEmail() {
  console.log('=== 🍕 Pizza Shop Email Diagnostic Tool ===');
  console.log('Node Environment Check:');
  console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? `Configured (starts with ${process.env.RESEND_API_KEY.slice(0, 7)}...)` : 'Not set');
  console.log('- RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL || 'Not set');
  console.log('- REPORT_TO_EMAILS:', process.env.REPORT_TO_EMAILS || 'Not set');
  console.log('- ZOHO_USER:', process.env.ZOHO_USER || 'Not set');
  console.log('- SMTP_HOST:', process.env.SMTP_HOST || 'Not set');
  console.log('- GMAIL_USER:', process.env.GMAIL_USER || 'Not set');

  const recipients = await getRecipientEmails();
  console.log('\nResolved Recipients (DB + .env):', recipients);

  const smtpConfig = getSmtpConfig();
  console.log('Active SMTP Provider:', smtpConfig ? smtpConfig.provider : 'None configured');

  console.log('\nTesting Dispatch...');
  const testPayload = {
    to: recipients.length > 0 ? recipients : ['test@example.com'],
    subject: '🍕 Diagnostic Test: Email Service Verification',
    html: '<p>This is a verification email from Pizza Shop Employee Management System.</p>',
    text: 'This is a verification email from Pizza Shop Employee Management System.'
  };

  const result = await dispatchEmail(testPayload);
  console.log('\nDispatch Result:', result);
  process.exit(0);
}

testEmail().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
