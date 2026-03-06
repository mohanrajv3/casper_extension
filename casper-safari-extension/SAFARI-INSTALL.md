# CASPER Extension Installation Guide for Safari

## Prerequisites

- **macOS 10.14.4 or later**
- **Safari 14.0 or later**
- **Xcode 12 or later** (for development)

## Installation Methods

### Method 1: Safari Web Extension (Recommended)

1. **Enable Developer Menu in Safari**
   - Open Safari
   - Go to Safari → Settings → Advanced (or Safari → Preferences → Advanced on older versions)
   - Check "Show features for web developers" or "Show Develop menu in menu bar"

2. **Load the Extension**
   - Open Safari
   - Go to Develop → Allow Unsigned Extensions
   - Go to Safari → Settings → Extensions (or Safari → Preferences → Extensions on older versions)
   - Click the checkbox next to "Developer Extensions"
   - Find "CASPER Password Manager" and enable it

3. **Alternative Loading Method**
   - Open Safari
   - Go to Develop → Web Extension Background Content
   - Navigate to the `casper-safari-extension` folder
   - Select the folder and click "Select Folder"

### Method 2: Using Safari Web Extension Converter (Advanced)

If you want to create a proper Safari App Extension:

1. **Install Xcode** from the Mac App Store

2. **Convert to Safari App Extension**
   ```bash
   # Open Terminal and run:
   xcrun safari-web-extension-converter /path/to/casper-safari-extension
   ```

3. **Build and Install**
   - Open the generated Xcode project
   - Build and run the project
   - The extension will be installed automatically

## Verification

After installation, you should see:
- 🔐 CASPER icon in Safari's toolbar
- Extension listed in Safari → Preferences → Extensions
- No error messages in Safari's Web Inspector

## First Run Setup

1. **Click the CASPER icon** in Safari's toolbar
2. **Create your vault** with a 4-6 digit PIN
3. **Test the extension** by visiting a login page

## Safari-Specific Features

### What Works
- ✅ Password storage and retrieval
- ✅ Auto-fill detection and injection
- ✅ PIN-based vault unlocking
- ✅ CASPER breach detection algorithm
- ✅ Form detection and credential saving
- ✅ Password generation

### Safari Limitations
- ❌ Cannot open new tabs from popup (security restriction)
- ❌ Limited background processing
- ❌ No direct access to browser tabs from content scripts
- ❌ Reduced notification capabilities

### Workarounds
- **Vault Interface**: Use the test page at `casper-safari-extension/test/casper-test.html`
- **Tab Management**: Extension works within current tab context
- **Notifications**: Uses console logging and in-page alerts

## Troubleshooting

### Extension Won't Load
1. **Check Safari Version**: Ensure Safari 14.0 or later
2. **Enable Developer Mode**: 
   - Safari → Settings → Advanced → Show features for web developers (or Safari → Preferences → Advanced → Show Develop menu on older versions)
   - Develop → Allow Unsigned Extensions
3. **Check Console**: Open Web Inspector for error messages

### Popup Won't Open
1. **Check Extension Permissions**: Safari → Settings → Extensions (or Safari → Preferences → Extensions)
2. **Reload Extension**: Disable and re-enable in Extensions settings
3. **Clear Cache**: Safari → Develop → Empty Caches

### Auto-fill Not Working
1. **Check Website Compatibility**: Some sites block extension scripts
2. **Reload Page**: Refresh the page after enabling extension
3. **Check Form Detection**: Look for CASPER autofill button near password fields

### Vault Won't Unlock
1. **Check PIN**: Ensure you're entering the correct 4-6 digit PIN
2. **Clear Storage**: Safari → Preferences → Privacy → Manage Website Data
3. **Reinstall Extension**: Remove and reinstall the extension

## Development Mode

For developers wanting to modify the extension:

1. **Enable Web Inspector**
   ```
   Safari → Preferences → Advanced → Show features for web developers
   ```

2. **Debug Background Script**
   ```
   Develop → Web Extension Background Content → CASPER Password Manager
   ```

3. **Debug Content Scripts**
   ```
   Right-click on page → Inspect Element → Console
   ```

4. **Debug Popup**
   ```
   Right-click CASPER icon → Inspect Element
   ```

## Security Notes

- **Local Storage Only**: Safari version uses local storage (no cloud sync)
- **PIN Security**: Your PIN is never stored or transmitted
- **Sandbox Restrictions**: Safari's security model limits some features
- **HTTPS Required**: Extension only works on secure (HTTPS) websites

## Performance

### Expected Performance
- **Vault unlock**: < 1 second
- **Password autofill**: < 500ms
- **Form detection**: < 200ms
- **Memory usage**: < 20MB

### Optimization Tips
- Keep vault size reasonable (< 1000 passwords)
- Close unused Safari tabs to free memory
- Restart Safari periodically for best performance

## Uninstallation

To remove the extension:

1. **Disable Extension**
   - Safari → Preferences → Extensions
   - Uncheck "CASPER Password Manager"

2. **Remove Extension Files**
   - Delete the `casper-safari-extension` folder
   - Clear Safari cache and data

3. **Clean Up Storage**
   - Safari → Settings → Privacy → Manage Website Data (or Safari → Preferences → Privacy → Manage Website Data)
   - Remove any CASPER-related entries

## Known Issues

### Current Limitations
- **No Cross-Tab Sync**: Each tab maintains separate state
- **Limited Notifications**: Uses console logging instead of system notifications
- **No New Tab Creation**: Cannot open vault in new tab from popup
- **Storage Limitations**: Uses localStorage instead of browser.storage

### Planned Improvements
- Better Safari integration
- Native App Extension version
- Enhanced security features
- Improved user interface

## Support

For Safari-specific issues:

1. **Check Safari Console**: Look for JavaScript errors
2. **Test in Chrome**: Compare behavior with Chrome version
3. **Check Compatibility**: Ensure website allows extension scripts
4. **Report Issues**: Include Safari version and macOS version

## Alternative Testing

If you encounter issues with Safari, you can test the core CASPER algorithm:

1. **Open Test Page**
   ```
   Open casper-safari-extension/test/casper-test.html in Safari
   ```

2. **Run Algorithm Tests**
   - Click "Test CASPER Components"
   - Verify all tests pass
   - Test vault operations with a PIN

3. **Manual Testing**
   - Create vault with PIN
   - Add test passwords
   - Verify encryption/decryption works

---

**Need Help?** 
- Check the main [README.md](../casper-extension/README.md) for general usage
- Review Safari Web Extensions documentation
- Test with the Chrome version for comparison