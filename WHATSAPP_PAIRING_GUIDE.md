# 🔐 WhatsApp Pairing Mode Guide

## 📱 How to Connect Your WhatsApp Account

Your Mazari Bot now uses **Pairing Code Mode** instead of QR codes for better security and ease of use.

### 🚀 Starting the Bot

#### Option 1: Use the Batch File (Recommended for Windows)
1. Double-click `start-bot.bat`
2. Press any key when prompted
3. The bot will start and prompt for your phone number

#### Option 2: Use PowerShell Script
1. Right-click `start-bot.ps1`
2. Select "Run with PowerShell"
3. The bot will start automatically

#### Option 3: Manual Command Line
1. Open PowerShell or Command Prompt
2. Navigate to your bot folder: `cd "C:\Users\Sarukh\Desktop\Mazari-Bot"`
3. Run: `node index.js`

### 📞 Entering Your Phone Number

When the bot starts, you'll see:
```
🔐 WhatsApp Pairing Mode Activated
📱 You need to link your WhatsApp account using a pairing code

📞 Please type your WhatsApp number 😍
Format: 6281376552730 (without + or spaces) : 
```

**Enter your phone number in international format:**
- ✅ **Correct formats:**
  - `6281234567890` (Indonesia)
  - `15551234567` (USA)
  - `447911123456` (UK)
  - `919876543210` (India)

- ❌ **Wrong formats:**
  - `+6281234567890` (with +)
  - `628 123 456 7890` (with spaces)
  - `081234567890` (without country code)

### 🔐 Getting Your Pairing Code

After entering your number, you'll see:
```
╔══════════════════════════════════════════╗
║           🔐 PAIRING CODE 🔐            ║
╠══════════════════════════════════════════╣
║  Your Pairing Code: XXXX-XXXX           ║
╚══════════════════════════════════════════╝
```

### 📱 Linking WhatsApp on Your Phone

1. **Open WhatsApp** on your phone
2. **Go to Settings** → **Linked Devices**
3. **Tap "Link a Device"**
4. **Choose "Link with phone number"**
5. **Enter the pairing code** shown above
6. **Wait for confirmation**

### ✅ Success!

Once linked, you'll see:
```
🌿Connected to => [Your WhatsApp Info]
🤖 MazariBot Connected Successfully!
```

### 🔄 Re-pairing (If Needed)

If you need to reconnect:
- Use `.repair` command in WhatsApp (owner/sudo only)
- Or delete the `session` folder manually
- Restart the bot

### 🆘 Troubleshooting

**"Please run the bot in an interactive terminal"**
- Don't double-click `.js` files
- Use PowerShell, Command Prompt, or the batch files

**"Failed to get pairing code"**
- Check your phone number format
- Make sure you included country code
- Try restarting the bot

**"Session logged out"**
- The bot will automatically restart
- Enter your phone number again
- Use the new pairing code

### 💡 Tips

- Keep your phone connected to the internet
- Make sure WhatsApp is up to date
- The pairing code expires quickly, so enter it promptly
- You only need to pair once unless you clear the session

---

**Need help?** Check the bot's help menu with `.help` command!
