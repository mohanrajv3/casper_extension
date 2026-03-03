# 🔧 EmailJS Template Setup - Step by Step

The error "undefined" means your EmailJS templates don't have the right variable names. Let's fix this:

## Step 1: Check Your Current Templates

1. **Go to EmailJS Dashboard:** [https://dashboard.emailjs.com/](https://dashboard.emailjs.com/)
2. **Click "Email Templates"**
3. **Find your templates:**
   - `template_zgcsbzo` (Welcome)
   - `template_n6m2wxk` (Breach/Password Reset)

## Step 2: Update Welcome Template (`template_zgcsbzo`)

**Click on `template_zgcsbzo` → Edit**

### Subject Line:
```
{{subject}}
```

### Email Content:
```
Hello {{to_name}},

{{subject}}

Security Features:
{{vault_features}}

Important Note: {{security_note}}

Sent at: {{timestamp}}

Best regards,
CASPER Security Team
```

**Save the template**

## Step 3: Update Breach Template (`template_n6m2wxk`)

**Click on `template_n6m2wxk` → Edit**

### Subject Line:
```
{{subject}}
```

### Email Content:
```
Hello {{to_name}},

CRITICAL SECURITY BREACH DETECTED!

Breach Details:
- Time: {{breach_time}}
- Account: {{breach_account}}
- Website: {{breach_website}}
- Reason: {{breach_reason}}
- Password: {{partial_password}}

IMMEDIATE ACTIONS REQUIRED:
{{immediate_actions}}

Sent at: {{timestamp}}

CASPER Security System
```

**Save the template**

## Step 4: Test with Minimal Template

If the above doesn't work, let's create a super simple template:

### Create New Test Template:
1. **Create New Template** in EmailJS
2. **Template ID:** `template_test`
3. **Subject:** `{{subject}}`
4. **Content:** 
```
Hello,

{{message}}

From: CASPER Test
```

## Step 5: Alternative - Use Default Variables

Many EmailJS templates use these standard variables:
- `{{to_name}}`
- `{{from_name}}`
- `{{message}}`
- `{{reply_to}}`

Let me create a version that uses only these standard variables.

## Step 6: Quick Fix - Simple Template

**Edit your welcome template (`template_zgcsbzo`) to this minimal version:**

### Subject:
```
CASPER Password Manager
```

### Content:
```
Hello,

Welcome to CASPER Password Manager!

Your secure vault has been created successfully.

Security Features:
• AES-256-GCM encryption
• 5 cryptographic detection secrets
• Real-time breach detection
• Secure local storage

Keep your PIN secure - it's the only way to access your vault.

Best regards,
CASPER Security Team
```

This version has **NO variables** - it should work immediately.

## Step 7: Test Again

1. **Save your template changes**
2. **Refresh the email-test.html page**
3. **Click "Test Minimal Email"**
4. **Check your inbox**

## Common Issues:

### A. Template Not Found (404)
- Template ID is wrong
- Template was deleted
- Service ID is wrong

### B. Authentication Error (401)
- Public key is wrong
- Service is not active

### C. Bad Request (400)
- Template variables don't match
- Required fields missing

### D. Undefined Error
- Template exists but variables don't match
- Template content has syntax errors

## Next Steps:

1. **Try the simple template first** (no variables)
2. **If that works**, gradually add variables back
3. **If it still fails**, create a brand new template
4. **Check EmailJS dashboard** for any error messages

Let me know what happens when you test with the simplified template! 🔧