# 📧 Real Email Setup for CASPER Production

To enable **real email sending** for breach alerts and welcome messages, you need to configure an email service. Here are two options:

## Option 1: EmailJS (Recommended)

EmailJS allows sending emails directly from the browser without a backend server.

### Setup Steps:

1. **Create EmailJS Account**
   - Go to [https://www.emailjs.com/](https://www.emailjs.com/)
   - Sign up for a free account (1000 emails/month)

2. **Create Email Service**
   - Go to Email Services → Add New Service
   - Choose your email provider (Gmail, Outlook, etc.)
   - Follow the setup instructions

3. **Create Email Template**
   - Go to Email Templates → Create New Template
   - Template ID: `template_casper`
   - Template content:
   ```
   Subject: {{subject}}
   
   To: {{to_email}}
   
   {{message}}
   
   Sent at: {{timestamp}}
   ```

4. **Get Your Keys**
   - Service ID: Found in Email Services (e.g., `service_abc123`)
   - Template ID: `template_casper`
   - Public Key: Found in Account → API Keys

5. **Update the Code**
   In `casper-production.html`, update these lines:
   ```javascript
   this.serviceId = 'your_service_id_here';
   this.templateId = 'template_casper';
   this.publicKey = 'your_public_key_here';
   ```

## Option 2: Formspree (Alternative)

Formspree is a simple form backend service that can send emails.

### Setup Steps:

1. **Create Formspree Account**
   - Go to [https://formspree.io/](https://formspree.io/)
   - Sign up for a free account (50 submissions/month)

2. **Create New Form**
   - Create a new form
   - Copy the form endpoint URL (e.g., `https://formspree.io/f/abc123`)

3. **Update the Code**
   In `casper-production.html`, update this line:
   ```javascript
   this.formspreeEndpoint = 'https://formspree.io/f/your_form_id_here';
   ```

## Option 3: Simple SMTP Service

For a more robust solution, you can use a dedicated email service:

### Recommended Services:
- **SendGrid** - 100 emails/day free
- **Mailgun** - 5,000 emails/month free
- **Amazon SES** - Pay per use

### Implementation:
You'll need to create a simple backend API that accepts email requests and sends them via SMTP.

## Testing Your Setup

1. **Open** `casper-production.html`
2. **Create a vault** with your real email address
3. **Check your inbox** for the welcome email
4. **Test breach detection** by adding a password with "trap" in it
5. **Use the test buttons** in the Security tab

## Email Templates

### Welcome Email Template:
```
Subject: 🔐 Welcome to CASPER Password Manager

Welcome to CASPER Password Manager!

Your secure vault has been created successfully with the following features:

🛡️ Security Features:
• AES-256-GCM encryption
• 5 cryptographic detection secrets
• Real-time breach detection
• Secure local storage

🚨 Breach Detection:
If we detect any unauthorized access to your vault using trap keys, 
you will receive immediate email alerts.

Keep your PIN secure - it's the only way to access your vault.

Best regards,
CASPER Security Team
```

### Breach Alert Template:
```
Subject: 🚨 CRITICAL SECURITY ALERT - CASPER Breach Detected

CRITICAL SECURITY BREACH DETECTED!

Your CASPER password manager has detected unauthorized access:

🚨 Breach Details:
• Time: [timestamp]
• Account: [username]
• Website: [site]
• Reason: Trap key detected in password

🔥 IMMEDIATE ACTION REQUIRED:
1. Change your CASPER PIN immediately
2. Review all stored passwords
3. Change passwords for affected accounts
4. Check for unauthorized account access

This alert was triggered because someone used a trap key that should 
only exist if your encrypted vault data was compromised.

If this was not you, your vault security may be compromised.

CASPER Security System
```

## Security Notes

- **Never store email credentials** in the frontend code
- **Use environment variables** for sensitive keys
- **Enable CORS** properly for your domain
- **Monitor email usage** to prevent abuse
- **Test thoroughly** before production use

## Troubleshooting

### Common Issues:

1. **CORS Errors**
   - Make sure your domain is whitelisted in EmailJS/Formspree
   - Check browser console for specific errors

2. **Emails Not Sending**
   - Verify your service credentials
   - Check spam folder
   - Ensure email service is active

3. **Rate Limiting**
   - Most free services have daily/monthly limits
   - Consider upgrading for higher volumes

### Debug Mode:

Add this to enable debug logging:
```javascript
// Add to the EmailService constructor
this.debug = true;

// Add debug logging in sendEmail method
if (this.debug) {
    console.log('Sending email:', emailData);
}
```

## Production Deployment

For production use:

1. **Use HTTPS** - Required for most email services
2. **Implement rate limiting** - Prevent abuse
3. **Add error handling** - Graceful fallbacks
4. **Monitor usage** - Track email sending
5. **Backup email method** - Fallback service

Your CASPER password manager will now send real emails for security alerts! 🚀