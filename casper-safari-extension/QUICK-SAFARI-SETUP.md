# 🚀 Quick Safari Setup Guide

## Step-by-Step Installation (Modern Safari)

### Step 1: Enable Developer Features
1. **Open Safari**
2. **Click "Safari" in the menu bar** (top left)
3. **Click "Settings..."** (or "Preferences..." in older Safari)
4. **Click the "Advanced" tab**
5. **Check the box**: "Show features for web developers" (or "Show Develop menu in menu bar")

### Step 2: Allow Unsigned Extensions
1. **Look for "Develop" in Safari's menu bar** (should appear after Step 1)
2. **Click "Develop"**
3. **Click "Allow Unsigned Extensions"**

### Step 3: Load the CASPER Extension
1. **Click "Safari" in the menu bar**
2. **Click "Settings..."** (or "Preferences...")
3. **Click the "Extensions" tab**
4. **Look for "Developer Extensions" section**
5. **Find "CASPER Password Manager"** and **check the box** to enable it

### Step 4: Verify Installation
1. **Look for the 🔐 CASPER icon** in Safari's toolbar
2. **If you don't see it**: Right-click the toolbar → Customize Toolbar → Drag CASPER icon to toolbar

## Alternative Method: Web Extension Converter

If the above doesn't work, try this method:

### Option A: Using Xcode (Recommended)
1. **Install Xcode** from the Mac App Store (free)
2. **Open Terminal** and run:
   ```bash
   xcrun safari-web-extension-converter /path/to/casper-safari-extension
   ```
3. **Follow the prompts** to create a Safari App Extension
4. **Open the generated Xcode project**
5. **Build and run** the project

### Option B: Manual Loading
1. **Open Safari**
2. **Go to**: Develop → Web Extension Background Content
3. **Navigate to** the `casper-safari-extension` folder
4. **Select the folder** and click "Select Folder"

## Testing Your Installation

### Quick Test
1. **Click the CASPER icon** in Safari's toolbar
2. **You should see a popup** asking you to create a vault
3. **Enter a 4-6 digit PIN** to create your vault

### Full Test
1. **Open the test page**: `casper-safari-extension/safari-test.html`
2. **Click "Test Vault"** to verify extension communication
3. **Try the login form** to test autofill functionality

## Troubleshooting

### "I don't see the Develop menu"
- Make sure you checked "Show features for web developers" in Safari Settings → Advanced
- Restart Safari after enabling this option

### "I don't see CASPER in Extensions"
- Make sure you have the `casper-safari-extension` folder downloaded
- Try the Xcode method instead (Option A above)
- Check that you're looking in the "Developer Extensions" section, not regular extensions

### "The CASPER icon doesn't appear"
- Right-click Safari's toolbar
- Select "Customize Toolbar"
- Look for the CASPER icon and drag it to your toolbar

### "Extension loads but doesn't work"
- Open Safari's Web Inspector (Develop → Show Web Inspector)
- Check the Console tab for error messages
- Make sure you're testing on an HTTPS website

## Safari Version Compatibility

- **Safari 17+**: Use "Settings" instead of "Preferences"
- **Safari 16**: Use "Settings" or "Preferences" (both work)
- **Safari 14-15**: Use "Preferences"
- **Safari 13 and older**: Not supported

## Need More Help?

1. **Check your Safari version**: Safari → About Safari
2. **Try the test page**: Open `safari-test.html` in Safari
3. **Check the full guide**: Read `SAFARI-INSTALL.md` for detailed troubleshooting
4. **Test the algorithm**: Open `test/casper-test.html` to verify CASPER works

---

**🎉 Once installed, you'll have a secure password manager with breach detection running in Safari!**