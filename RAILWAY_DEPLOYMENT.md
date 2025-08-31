# 🚀 Railway Deployment Guide for MazariBot

## 📋 Prerequisites

- GitHub account with your MazariBot repository
- Railway account (free tier available)
- WhatsApp account for pairing

## 🔧 Railway Setup

### Step 1: Connect GitHub to Railway

1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your `MazariBot` repository
6. Click "Deploy Now"

### Step 2: Configure Environment Variables

In your Railway project dashboard, go to **Variables** tab and add:

```env
# Required for Railway deployment
SESSION_DIR=/data/session
PHONE_NUMBER=923232391033

# Optional (for better performance)
NODE_ENV=production
```

**Important Notes:**
- `PHONE_NUMBER`: Your WhatsApp number WITHOUT `+` symbol, WITH country code
- `SESSION_DIR`: Must be `/data/session` for Railway persistent storage

### Step 3: Add Persistent Volume

1. In Railway dashboard, go to **Volumes** tab
2. Click "New Volume"
3. Set:
   - **Name**: `session-storage`
   - **Mount Path**: `/data`
   - **Size**: 1 GB (minimum)
4. Click "Create Volume"

### Step 4: Configure Build Settings

In Railway dashboard, go to **Settings** tab:

1. **Build Command**: `npm install`
2. **Start Command**: `node index.js`
3. **Health Check Path**: Leave empty (not needed for WhatsApp bots)

## 🚀 Deploy

1. Railway will automatically build and deploy your bot
2. Check the **Deployments** tab for build status
3. Once deployed, check the **Logs** tab

## 📱 Pairing Your WhatsApp

### First Deployment

1. After deployment, check Railway logs
2. You should see:
   ```
   📞 Using PHONE_NUMBER env var to request a pairing code for 923232391033
   🔐 Pairing Code: XXXX-XXXX
   📱 WhatsApp → Settings → Linked Devices → Link with phone number
   🔐 Enter the pairing code above
   ```

3. **On your phone:**
   - Open WhatsApp
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Choose "Link with phone number"
   - Enter the pairing code from Railway logs

4. **Success indicators:**
   - Railway logs show: `✅ MazariBot connected successfully!`
   - Your phone shows: "Device linked successfully"

## 🔄 Re-pairing (If Needed)

If you need to re-pair:

1. **Use the .repair command** (if bot is working):
   - Send `.repair` to the bot (owner only)
   - Bot will clear session and restart

2. **Manual session clear**:
   - In Railway dashboard, go to **Volumes**
   - Delete the volume and recreate it
   - Redeploy the bot

3. **Check Railway logs** for new pairing code

## 🛠️ Troubleshooting

### Common Issues

1. **"PHONE_NUMBER not set"**
   - Check environment variables in Railway
   - Ensure `PHONE_NUMBER` is set correctly

2. **"Failed to request pairing code"**
   - Verify phone number format (no `+`, with country code)
   - Check Railway logs for detailed error

3. **Connection loops**
   - Ensure only one instance is running
   - Check if bot is running locally and on Railway simultaneously

4. **Session not persisting**
   - Verify volume is mounted at `/data`
   - Check `SESSION_DIR` environment variable

### Log Analysis

**Good logs:**
```
🚀 Starting MazariBot...
📞 Using PHONE_NUMBER env var to request a pairing code for 923232391033
🔐 Pairing Code: XXXX-XXXX
✅ MazariBot connected successfully!
🤖 Bot is now ready to receive messages
```

**Problem logs:**
```
❌ Failed to request pairing code via PHONE_NUMBER: [error]
❌ Maximum reconnection attempts (3) reached. Stopping bot.
```

## 📊 Monitoring

### Railway Dashboard

- **Deployments**: Check build status
- **Logs**: Monitor bot activity and errors
- **Metrics**: CPU, memory usage
- **Volumes**: Ensure session persistence

### Health Checks

- Bot responds to `.ping` command
- No connection loops in logs
- Session persists between restarts

## 🔒 Security Notes

- **Never commit** your actual phone number to GitHub
- Use Railway environment variables for sensitive data
- The bot only works with your paired WhatsApp account
- Session files contain encrypted credentials

## 📞 Support

If you encounter issues:

1. Check Railway logs first
2. Verify environment variables
3. Ensure volume is properly mounted
4. Check if bot is running elsewhere

## 🎯 Success Checklist

- [ ] Railway project created and connected to GitHub
- [ ] Environment variables set (`SESSION_DIR`, `PHONE_NUMBER`)
- [ ] Persistent volume mounted at `/data`
- [ ] Bot deployed successfully
- [ ] Pairing code received in Railway logs
- [ ] WhatsApp device linked successfully
- [ ] Bot shows "✅ MazariBot connected successfully!"
- [ ] Bot responds to commands (e.g., `.ping`)
- [ ] Session persists after Railway restart

---

**🎉 Congratulations!** Your MazariBot is now running on Railway and ready to use!
