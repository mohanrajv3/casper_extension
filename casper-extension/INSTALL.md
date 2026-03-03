# CASPER Extension Installation Guide

## Quick Installation (Chrome/Edge)

1. **Download** or clone this extension folder to your computer
2. **Open Chrome/Edge** and go to `chrome://extensions/` (or `edge://extensions/`)
3. **Enable "Developer mode"** using the toggle in the top-right corner
4. **Click "Load unpacked"** button
5. **Select** the `casper-extension` folder
6. **Pin the extension** to your toolbar by clicking the puzzle piece icon and pinning CASPER

## Firefox Installation

1. **Open Firefox** and go to `about:debugging`
2. **Click "This Firefox"** in the left sidebar
3. **Click "Load Temporary Add-on"**
4. **Navigate** to the `casper-extension` folder and select `manifest.json`
5. The extension will be loaded temporarily (until Firefox restart)

## Verification

After installation, you should see:
- 🔐 CASPER icon in your browser toolbar
- Extension listed in your extensions page
- No error messages in the browser console

## First Run Setup

1. **Click the CASPER icon** in your toolbar
2. **Create your vault** with a 4-6 digit PIN
3. **Test the extension** by visiting a login page

## Troubleshooting

### Extension won't load
- **Check file permissions**: Ensure all files are readable
- **Verify manifest**: Make sure `manifest.json` is valid
- **Check console**: Look for error messages in browser developer tools
- **Try different browser**: Test in Chrome, Edge, or Firefox

### Missing icons
- The extension will work without custom icons
- Browser will show a default extension icon
- Functionality is not affected

### Permission errors
- Some features require `<all_urls>` permission
- Click "Allow" when prompted for permissions
- Check extension permissions in browser settings

## Development Mode

For developers wanting to modify the extension:

1. **Make changes** to the source files
2. **Go to extensions page** (`chrome://extensions/`)
3. **Click the refresh icon** on the CASPER extension card
4. **Test your changes** by using the extension

## Security Notes

- **This is a development version** - use at your own risk
- **Your PIN is never stored** - remember it carefully
- **Vault data is encrypted** and stored locally
- **No data is sent** to external servers

## Uninstallation

To remove the extension:
1. **Go to extensions page** (`chrome://extensions/`)
2. **Find CASPER** in the list
3. **Click "Remove"** button
4. **Confirm removal** when prompted

Your vault data will be deleted when you remove the extension.

## Next Steps

After installation:
- Read the main [README.md](README.md) for usage instructions
- Test the extension on a few websites
- Report any issues or bugs
- Consider the security implications for your use case

---

**Need help?** Check the troubleshooting section in the main README or open an issue on GitHub.