# 📧 EmailJS Templates for CASPER

Your EmailJS Service ID: `service_zi7rghfgiv`

## Your Existing Templates:
- **Welcome Template ID:** `template_zgcsbzo` ✅
- **Breach Alert Template ID:** `template_n6m2wxk` ✅ (using Password Reset template)

## Template Configuration:

### Template 1: Welcome Email (`template_zgcsbzo`)
**Current Template:** Welcome
**Usage:** Sent when user creates a new CASPER vault

**Required Variables:**
```
{{to_email}} - Recipient email address
{{to_name}} - Recipient name (extracted from email)
{{subject}} - Email subject line
{{vault_features}} - List of security features
{{security_note}} - Security reminder message
{{timestamp}} - When email was sent
```

### Template 2: Breach Alert (`template_n6m2wxk`)
**Current Template:** Password Reset (repurposed for breach alerts)
**Usage:** Sent when trap key breach is detected

**Required Variables:**
```
{{to_email}} - Recipient email address
{{to_name}} - Recipient name
{{subject}} - Email subject line
{{breach_time}} - When breach was detected
{{breach_account}} - Compromised account
{{breach_website}} - Target website
{{breach_reason}} - Why breach was detected
{{partial_password}} - Partial password (for security)
{{immediate_actions}} - List of required actions
{{timestamp}} - When alert was sent
```

### Subject:
```
{{subject}}
```

### Content:
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .features { background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔐 Welcome to CASPER Password Manager</h1>
    </div>
    
    <div class="content">
        <p>Hello {{to_name}},</p>
        
        <p>Welcome to CASPER Password Manager! Your secure vault has been created successfully.</p>
        
        <div class="features">
            <h3>🛡️ Your Security Features:</h3>
            <pre>{{vault_features}}</pre>
        </div>
        
        <div style="background: #dbeafe; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <h4>🚨 Breach Detection Active</h4>
            <p>If we detect any unauthorized access to your vault using trap keys, you will receive immediate email alerts.</p>
        </div>
        
        <p><strong>Important:</strong> {{security_note}}</p>
        
        <p>Best regards,<br>
        <strong>CASPER Security Team</strong></p>
    </div>
    
    <div class="footer">
        <p>This email was sent to {{to_email}} at {{timestamp}}</p>
        <p>CASPER Password Manager - Secure by Design</p>
    </div>
</body>
</html>
```

---

## Template 2: Breach Alert Email
**Template ID:** `template_breach`

### Subject:
```
{{subject}}
```

### Content:
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .alert { background: #fee2e2; border: 2px solid #fecaca; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .breach-details { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
        .actions { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #64748b; }
        .critical { color: #dc2626; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 CRITICAL SECURITY ALERT</h1>
        <p>CASPER Breach Detection System</p>
    </div>
    
    <div class="content">
        <p>Hello {{to_name}},</p>
        
        <div class="alert">
            <h2 class="critical">SECURITY BREACH DETECTED!</h2>
            <p>Your CASPER password manager has detected unauthorized access to your vault.</p>
        </div>
        
        <div class="breach-details">
            <h3>🚨 Breach Details:</h3>
            <ul>
                <li><strong>Detection Time:</strong> {{breach_time}}</li>
                <li><strong>Compromised Account:</strong> {{breach_account}}</li>
                <li><strong>Target Website:</strong> {{breach_website}}</li>
                <li><strong>Detection Reason:</strong> {{breach_reason}}</li>
                <li><strong>Partial Password Used:</strong> {{partial_password}}</li>
            </ul>
        </div>
        
        <div class="actions">
            <h3 class="critical">🔥 IMMEDIATE ACTION REQUIRED:</h3>
            <pre>{{immediate_actions}}</pre>
        </div>
        
        <div style="background: #fee2e2; padding: 15px; border-radius: 8px;">
            <p><strong>⚠️ WARNING:</strong> This alert was triggered because someone used a trap key that should only exist if your encrypted vault data was compromised.</p>
            <p><strong>If this was not you, your vault security may be compromised.</strong></p>
        </div>
        
        <p>Take immediate action to secure your accounts.</p>
        
        <p>CASPER Security System<br>
        <em>Automated Breach Detection</em></p>
    </div>
    
    <div class="footer">
        <p>Alert sent to {{to_email}} at {{timestamp}}</p>
        <p>CASPER Password Manager - Advanced Threat Detection</p>
    </div>
</body>
</html>
```

---

## Setup Instructions:

1. **Go to EmailJS Dashboard:** [https://dashboard.emailjs.com/](https://dashboard.emailjs.com/)

2. **Create Template 1 (Welcome):**
   - Click "Email Templates" → "Create New Template"
   - Template ID: `template_welcome`
   - Copy the welcome email content above
   - Save template

3. **Create Template 2 (Breach Alert):**
   - Click "Create New Template" again
   - Template ID: `template_breach`
   - Copy the breach alert email content above
   - Save template

4. **Get Your Public Key:**
   - Go to "Account" → "API Keys"
   - Copy your Public Key
   - Update the code in `casper-production.html`:
   ```javascript
   this.publicKey = 'YOUR_PUBLIC_KEY_HERE';
   ```

5. **Test Your Setup:**
   - Open `casper-production.html`
   - Create a vault with your email
   - Check if you receive the welcome email
   - Test breach detection with a password containing "trap"

## Template Variables Used:

### Welcome Email:
- `{{to_email}}` - Recipient email
- `{{to_name}}` - Recipient name (extracted from email)
- `{{subject}}` - Email subject
- `{{vault_features}}` - Security features list
- `{{security_note}}` - Security reminder
- `{{timestamp}}` - When email was sent

### Breach Alert:
- `{{to_email}}` - Recipient email
- `{{to_name}}` - Recipient name
- `{{subject}}` - Email subject
- `{{breach_time}}` - When breach was detected
- `{{breach_account}}` - Compromised account
- `{{breach_website}}` - Target website
- `{{breach_reason}}` - Why breach was detected
- `{{partial_password}}` - Partial password (for security)
- `{{immediate_actions}}` - List of required actions
- `{{timestamp}}` - When alert was sent

Your CASPER system will now send professional, HTML-formatted emails! 🚀