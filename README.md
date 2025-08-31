# 🤖 MazariBot - WhatsApp Bot

A powerful WhatsApp bot with 80+ commands, auto-reactions, and advanced features.

## 🚀 **Get Your Pairing Code NOW!**

**[🔐 CLICK HERE TO GET YOUR PAIRING CODE](https://sarukhmazari.github.io/MazariBot/)**

**Users can now get pairing codes directly from GitHub and connect to your Railway bot instantly!**

---

## ⚠️ **IMPORTANT: Bot Must Be Deployed to Work**

**This repository only contains the bot code. The bot will NOT work just by pairing with the code here.**

**To make the bot functional, you MUST deploy it to a server (like Railway).**

## 🚀 **Quick Start (Railway Deployment)**

### **Option 1: One-Click Deploy (Recommended)**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https://github.com/sarukhmazari/MazariBot)

### **Option 2: Manual Deploy**
1. **Fork this repository**
2. **Go to [Railway.app](https://railway.app)**
3. **Sign in with GitHub**
4. **Click "New Project"**
5. **Select "Deploy from GitHub repo"**
6. **Choose your forked repository**
7. **Set Environment Variables:**
   ```env
   SESSION_DIR=/data/session
   PHONE_NUMBER=YOUR_PHONE_NUMBER
   ```
8. **Add Persistent Volume:**
   - Name: `session-storage`
   - Mount Path: `/data`
   - Size: 1 GB
9. **Deploy!**

## 📱 **After Railway Deployment**

1. **Check Railway logs** for pairing code
2. **On your phone:** WhatsApp → Settings → Linked Devices → Link with phone number
3. **Enter the pairing code** from Railway logs
4. **Bot becomes fully functional!**

## 🔧 **Local Development (Optional)**

If you want to test locally:

```bash
# Clone repository
git clone https://github.com/sarukhmazari/MazariBot.git
cd MazariBot

# Install dependencies
npm install

# Set environment variables
export SESSION_DIR=./session
export PHONE_NUMBER=923232391033

# Start bot
node index.js
```

## ✨ **Features**

- 🤖 **80+ Commands** - From basic to advanced
- 🎯 **Auto-Reactions** - Reacts to every message with 488+ emojis
- 🎮 **Games** - Tic-tac-toe, hangman, trivia
- 🎨 **Media Tools** - Stickers, image editing, TTS
- 🛡️ **Moderation** - Anti-spam, anti-link, warnings
- 📊 **Analytics** - Message counting, top members
- 🔐 **Security** - Owner-only commands, sudo system

## 📋 **Command Categories**

### **Basic Commands**
- `.ping` - Check bot status
- `.help` - Show all commands
- `.owner` - Bot owner info
- `.test` - Test if bot is working

### **Media Commands**
- `.sticker` - Create stickers
- `.simage` - Convert stickers to images
- `.tts` - Text to speech
- `.video` - Download videos

### **Group Management**
- `.ban` / `.unban` - Ban/unban users
- `.mute` / `.unmute` - Mute/unmute users
- `.promote` / `.demote` - Promote/demote admins
- `.tagall` - Tag all group members

### **Entertainment**
- `.joke` - Get random jokes
- `.quote` - Get inspirational quotes
- `.meme` - Get random memes
- `.weather` - Check weather

## 🔐 **Owner Commands**

- `.mode` - Set bot to public/private
- `.areact` - Enable/disable auto-reactions
- `.autostatus` - Auto-status updates
- `.clearsession` - Clear bot session

## 🌐 **Environment Variables**

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_DIR` | Session storage directory | Yes |
| `PHONE_NUMBER` | Your WhatsApp number | Yes |
| `NODE_ENV` | Environment (production/development) | No |

## 📁 **Project Structure**

```
MazariBot/
├── commands/          # Bot commands
├── lib/              # Utility functions
├── data/             # Data storage
├── assets/           # Bot assets
├── session/          # WhatsApp session (local only)
├── index.js          # Main bot file
├── main.js           # Command handlers
├── settings.js       # Bot configuration
└── RAILWAY_DEPLOYMENT.md  # Railway deployment guide
```

## 🚨 **Troubleshooting**

### **Bot Not Responding After Pairing**
- **Ensure bot is deployed on Railway**
- **Check Railway logs for errors**
- **Verify environment variables are set**
- **Make sure persistent volume is mounted**

### **Session Issues**
- **Clear session in Railway dashboard**
- **Re-pair with new code**
- **Check SESSION_DIR is set to `/data/session`**

### **Commands Not Working**
- **Send `.test` command to verify bot is responsive**
- **Check Railway logs for command processing**
- **Ensure bot has proper permissions**

## 📞 **Support**

If you encounter issues:

1. **Check Railway logs first**
2. **Verify environment variables**
3. **Ensure persistent volume is mounted**
4. **Check if bot is running elsewhere**

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Credits**

- **Bot Development:** ZOXER & MAZARI
- **WhatsApp Library:** [Baileys](https://github.com/whiskeysockets/Baileys)
- **Deployment Platform:** [Railway](https://railway.app)

---

## 🎯 **Quick Deployment Checklist**

- [ ] Fork this repository
- [ ] Deploy to Railway
- [ ] Set environment variables
- [ ] Add persistent volume
- [ ] Get pairing code from logs
- [ ] Pair with WhatsApp
- [ ] Test with `.test` command
- [ ] Bot is now fully functional! 🎉

**Remember: The bot code alone won't work - it must be deployed on Railway to function!**
