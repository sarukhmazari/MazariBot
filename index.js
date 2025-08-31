/**
 * MazariBot - A WhatsApp Bot
 * Copyright (c) 2024 ZOXER & MAZARI
 * MIT License
 * 
 * ⚠️  IMPORTANT: This bot code alone will NOT work!
 * 
 * To make the bot functional, you MUST deploy it to a server (like Railway).
 * Simply pairing with the code here will only give you credentials, not a working bot.
 * 
 * 🚀 Deploy to Railway:
 * 1. Go to Railway.app
 * 2. Connect your GitHub repo
 * 3. Set environment variables (SESSION_DIR, PHONE_NUMBER)
 * 4. Add persistent volume
 * 5. Deploy and pair with the code from Railway logs
 * 
 * 📖 See RAILWAY_DEPLOYMENT.md for detailed instructions
 */

require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const qrcode = require('qrcode-terminal')
const NodeCache = require('node-cache')
const pino = require('pino')
const readline = require('readline')
const path = require('path')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  delay
} = require('@whiskeysockets/baileys')

// ==== CONFIG ====
const SESSION_DIR = process.env.SESSION_DIR || './session'   // <-- mount a Railway Volume and set SESSION_DIR=/data/session
const STORE_FILE = process.env.STORE_FILE || './baileys_store.json'
const PHONE_NUMBER = process.env.PHONE_NUMBER || null         // <-- set on Railway like 923232391033 (no +)
const RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_ATTEMPTS = 3

// ==== LIGHTWEIGHT STORE (optional) ====
const store = { messages: {}, contacts: {}, chats: {} }
store.readFromFile = (filePath = STORE_FILE) => {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      store.messages = data.messages || {}
      store.contacts = data.contacts || {}
      store.chats = data.chats || {}
    }
  } catch (e) { console.warn('Failed to read store:', e.message) }
}
store.writeToFile = (filePath = STORE_FILE) => {
  try {
    const data = JSON.stringify({ messages: store.messages, contacts: store.contacts, chats: store.chats })
    fs.writeFileSync(filePath, data)
  } catch (e) { console.warn('Failed to write store:', e.message) }
}
store.readFromFile(STORE_FILE)
setInterval(() => store.writeToFile(STORE_FILE), 10_000)

// ==== PROMPT UTILS (only local/dev) ====
const rl = process.stdin.isTTY ? readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout,
  terminal: true
}) : null

const question = (text) => {
  if (!rl) {
    return Promise.reject(new Error('Non-interactive terminal'))
  }
  
  return new Promise((resolve) => {
    rl.question(text, (answer) => {
      resolve(answer)
    })
  })
}

// ==== GLOBAL FLAGS ====
let restarting = false
let reconnectAttempts = 0

// ===== BOT FUNCTIONALITY INITIALIZATION =====
async function initializeBot(sock) {
  try {
    console.log(chalk.blue('🔧 Initializing bot functionality...'))
    
    // Import main bot functionality
    const mainBot = require('./main.js')
    
    // Set up message handling
    sock.ev.on('messages.upsert', async (messageUpdate) => {
      try {
        await mainBot.handleMessages(sock, messageUpdate, true)
      } catch (error) {
        console.error(chalk.red('❌ Error handling message:'), error)
      }
    })

    // Set up group participant updates
    sock.ev.on('group-participants.update', async (update) => {
      try {
        await mainBot.handleGroupParticipantUpdate(sock, update)
      } catch (error) {
        console.error(chalk.red('❌ Error handling group update:'), error)
      }
    })

    // Set up status updates
    sock.ev.on('status.update', async (update) => {
      try {
        await mainBot.handleStatus(sock, update)
      } catch (error) {
        console.error(chalk.red('❌ Error handling status update:'), error)
      }
    })

    console.log(chalk.green('✅ Bot functionality initialized successfully!'))
    console.log(chalk.cyan('📝 Bot will now respond to messages and commands'))
    
  } catch (error) {
    console.error(chalk.red('❌ Error initializing bot functionality:'), error)
  }
}

async function startBot() {
  try {
    console.log(chalk.cyan('🚀 Starting MazariBot...'))
    
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
    const msgRetryCounterCache = new NodeCache()

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
      },
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    })

    // ===== FIRST RUN AUTH FLOW =====
    if (!sock.authState.creds.registered) {
      if (!rl) {
        // Server (Railway): use PHONE_NUMBER for pairing code
        if (PHONE_NUMBER) {
          const num = PHONE_NUMBER.replace(/[^0-9]/g, '')
          console.log(chalk.yellow(`\n📞 Using PHONE_NUMBER env var to request a pairing code for ${num}`))
          try {
            let code = await sock.requestPairingCode(num)
            code = code?.match(/.{1,4}/g)?.join('-') || code
            console.log(chalk.magenta('\n🔐 Pairing Code:'), chalk.bgGreen.black(code))
            console.log(chalk.cyan('📱 WhatsApp → Settings → Linked Devices → Link with phone number'))
            console.log(chalk.cyan('🔐 Enter the pairing code above'))
          } catch (err) {
            console.error(chalk.red('❌ Failed to request pairing code via PHONE_NUMBER:'), err?.message || err)
            console.error(chalk.yellow('Set a correct PHONE_NUMBER (no +, include country code).'))
          }
        } else {
          console.log(chalk.yellow('PHONE_NUMBER not set. Printing QR string to logs (best for local dev).'))
          sock.ev.on('connection.update', ({ qr }) => {
            if (qr) console.log('QR (string):', qr)
          })
        }
      } else {
        // Local/dev: let user choose
        try {
          console.log(chalk.cyan('🔐 Choose login method'))
          console.log(chalk.yellow('1️⃣  QR Code (scan in WhatsApp)'))
          console.log(chalk.yellow('2️⃣  Pairing Code (enter your phone number)'))
          
          const choice = await question(chalk.green('👉 Enter 1 or 2: '))
          console.log(chalk.blue(`You selected: ${choice}`))
          
          if (choice === '1') {
            console.log(chalk.green('📷 QR Code mode selected. Waiting for QR...'))
            sock.ev.on('connection.update', ({ qr }) => {
              if (qr) {
                console.log(chalk.green('📷 Scan this QR with WhatsApp:'))
                qrcode.generate(qr, { small: true })
              }
            })
          } else if (choice === '2') {
            console.log(chalk.green('📱 Pairing Code mode selected.'))
            const pn = await question(chalk.green('\n📞 Enter your WhatsApp number (e.g., 923232391033): '))
            console.log(chalk.blue(`Phone number entered: ${pn}`))
            
            const cleanPn = pn.replace(/[^0-9]/g, '')
            if (cleanPn.length < 10) {
              console.log(chalk.red('❌ Invalid phone number. Please enter a valid number with country code.'))
              return
            }
            
            try {
              console.log(chalk.yellow('�� Requesting pairing code...'))
              let code = await sock.requestPairingCode(cleanPn)
              code = code?.match(/.{1,4}/g)?.join('-') || code
              console.log(chalk.magenta('\n🔐 Pairing Code:'), chalk.bgGreen.black(code))
              console.log(chalk.cyan('📱 WhatsApp → Settings → Linked Devices → Link with phone number'))
              console.log(chalk.cyan('🔐 Enter the pairing code above'))
            } catch (err) {
              console.error(chalk.red('❌ Failed to get pairing code:'), err?.message || err)
              console.log(chalk.yellow("Retrying in 5 seconds..."))
              await delay(5000)
              startBot().catch(e => console.error("Error on restart:", e))
            }
          } else {
            console.log(chalk.red('❌ Invalid choice. Please enter 1 or 2.'))
            return
          }
        } catch (error) {
          console.error(chalk.red('❌ Error in input handling:'), error)
          console.log(chalk.yellow('Please restart the bot and try again.'))
        }
      }
    }

    // ===== CONNECTION EVENTS =====
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        console.log(chalk.green('✅ MazariBot connected successfully!'))
        console.log(chalk.cyan('🤖 Bot is now ready to receive messages'))
        reconnectAttempts = 0 // Reset reconnect attempts on successful connection
        if (rl) rl.close()
        
        // Send connection status message to WhatsApp
        try {
          // Get the bot's own JID
          const botJid = sock.user.id
          if (botJid) {
            // Send status message to show bot is online
            await sock.sendMessage(botJid, {
              text: '🤖 *MazariBot is now ONLINE!*\n\n✅ Bot connected successfully\n📱 Ready to receive messages and commands\n\nUse `.help` to see all available commands\nUse `.ping` to check if bot is responsive'
            })
            console.log(chalk.green('📱 Connection status message sent to WhatsApp'))
          }
        } catch (error) {
          console.log(chalk.yellow('⚠️ Could not send connection status message (this is normal for first-time setup)'))
        }
        
        // Initialize bot functionality
        await initializeBot(sock)
      }

      if (connection === 'close') {
        const status = new Boom(lastDisconnect?.error)?.output?.statusCode
        const text = DisconnectReason[status] || status

        console.log(chalk.yellow(`Connection closed. Reason: ${text}.`))

        // Cleanup on loggedOut to force full re-auth
        if (status === DisconnectReason.loggedOut || status === 401) {
          try { 
            fs.rmSync(SESSION_DIR, { recursive: true, force: true }) 
            console.log(chalk.red('Session removed. Will require re-link.'))
          } catch {}
        }

        // Prevent infinite reconnection loops
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log(chalk.red(`❌ Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping bot.`))
          console.log(chalk.yellow('Please check your connection and restart the bot manually.'))
          if (rl) rl.close()
          process.exit(1)
        }

        // Backoff & restart with limit
        if (!restarting) {
          restarting = true
          reconnectAttempts++
          console.log(chalk.gray(`Reconnecting in ${RECONNECT_DELAY_MS / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`))
          await delay(RECONNECT_DELAY_MS)
          restarting = false
          startBot().catch(e => console.error('Restart error:', e))
        }
      }
    })

    sock.ev.on('creds.update', saveCreds)

    // Initialize bot functionality
    await initializeBot(sock)

    return sock
  } catch (error) {
    console.error(chalk.red('❌ Error starting bot:'), error)
    throw error
  }
}

// ====== PROCESS-LEVEL SAFETY NETS ======
process.on('uncaughtException', (err) => {
  console.error(chalk.red('❌ Uncaught Exception:'), err)
  if (rl) rl.close()
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error(chalk.red('❌ Unhandled Rejection:'), err)
  if (rl) rl.close()
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down gracefully...'))
  if (rl) rl.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down...'))
  if (rl) rl.close()
  process.exit(0)
})

// Start the bot with proper error handling
startBot().catch((err) => {
  console.error(chalk.red('❌ Fatal startup error:'), err)
  if (rl) rl.close()
  process.exit(1)
})

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
let pairingStatus = 'pending';
let globalSock = null;

app.get('/', (req, res) => {
  res.send('MazariBot is running!');
});

app.get('/pairing-code', (req, res) => {
  res.sendFile(path.join(__dirname, 'pairing-generator.html'));
});

app.post('/api/generate-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  try {
    const sock = await startBot();
    let code = await sock.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    res.json({ success: true, code });
  } catch (error) {
    console.error(chalk.red('❌ Error generating pairing code:'), error);
    res.status(500).json({ success: false, message: 'Failed to generate pairing code' });
  }
});

app.get('/api/check-status/:code', (req, res) => {
  const { code } = req.params;
  // In a real application, you would check the status of the pairing code.
  // For this example, we'll just simulate a successful pairing after a delay.
  if (pairingStatus === 'completed') {
    res.json({ success: true, status: 'completed' });
  } else {
    res.json({ success: true, status: 'pending' });
  }
});

app.post('/api/complete-pairing', async (req, res) => {
  const { code, phoneNumber } = req.body;
  if (!code || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'Code and phone number are required' });
  }

  try {
    if (globalSock) {
      await globalSock.sendMessage(phoneNumber + '@s.whatsapp.net', {
        text: '🎉 Pairing completed successfully! Welcome to MazariBot!'
      });
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, message: 'Bot is not connected' });
    }
  } catch (error) {
    console.error(chalk.red('❌ Error sending completion message:'), error);
    res.status(500).json({ success: false, message: 'Failed to send completion message' });
  }
});

app.listen(port, () => {
  console.log(chalk.green(`🚀 MazariBot listening on port ${port}`));
});

let pairingStatus = 'pending';
let globalSock = null;

// ... (rest of the startBot function)

sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
  if (connection === 'open') {
    pairingStatus = 'completed';
    globalSock = sock;
    console.log(chalk.green('✅ MazariBot connected successfully!'))
    console.log(chalk.cyan('🤖 Bot is now ready to receive messages'))
    reconnectAttempts = 0 // Reset reconnect attempts on successful connection
    if (rl) rl.close()
    
    // Send connection status message to WhatsApp
    try {
      // Get the bot's own JID
      const botJid = sock.user.id
      if (botJid) {
        // Send status message to show bot is online
        await sock.sendMessage(botJid, {
          text: '🤖 *MazariBot is now ONLINE!*\n\n✅ Bot connected successfully\n📱 Ready to receive messages and commands\n\nUse `.help` to see all available commands\nUse `.ping` to check if bot is responsive'
        })
        console.log(chalk.green('📱 Connection status message sent to WhatsApp'))
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not send connection status message (this is normal for first-time setup)'))
    }
    
    // Initialize bot functionality
    await initializeBot(sock)
  }

  if (connection === 'close') {
    pairingStatus = 'pending';
    globalSock = null;
    const status = new Boom(lastDisconnect?.error)?.output?.statusCode
    const text = DisconnectReason[status] || status

    console.log(chalk.yellow(`Connection closed. Reason: ${text}.`))

    // Cleanup on loggedOut to force full re-auth
    if (status === DisconnectReason.loggedOut || status === 401) {
      try { 
        fs.rmSync(SESSION_DIR, { recursive: true, force: true })
        console.log(chalk.red('Session removed. Will require re-link.'))
      } catch {}
    }

    // Prevent infinite reconnection loops
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(chalk.red(`❌ Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping bot.`))
      console.log(chalk.yellow('Please check your connection and restart the bot manually.'))
      if (rl) rl.close()
      process.exit(1)
    }

    // Backoff & restart with limit
    if (!restarting) {
      restarting = true
      reconnectAttempts++
      console.log(chalk.gray(`Reconnecting in ${RECONNECT_DELAY_MS / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`))
      await delay(RECONNECT_DELAY_MS)
      restarting = false
      startBot().catch(e => console.error('Restart error:', e))
    }
  }
})

// ... (rest of the file)

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('MazariBot is running!');
});

app.get('/pairing-code', (req, res) => {
  res.sendFile(path.join(__dirname, 'pairing-generator.html'));
});

app.post('/api/generate-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  try {
    const sock = await startBot();
    let code = await sock.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join('-') || code;
    res.json({ success: true, code });
  } catch (error) {
    console.error(chalk.red('❌ Error generating pairing code:'), error);
    res.status(500).json({ success: false, message: 'Failed to generate pairing code' });
  }
});

app.get('/api/check-status/:code', (req, res) => {
  const { code } = req.params;
  // In a real application, you would check the status of the pairing code.
  // For this example, we'll just simulate a successful pairing after a delay.
  if (pairingStatus === 'completed') {
    res.json({ success: true, status: 'completed' });
  } else {
    res.json({ success: true, status: 'pending' });
  }
});

app.post('/api/complete-pairing', async (req, res) => {
  const { code, phoneNumber } = req.body;
  if (!code || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'Code and phone number are required' });
  }

  try {
    if (globalSock) {
      await globalSock.sendMessage(phoneNumber + '@s.whatsapp.net', {
        text: '🎉 Pairing completed successfully! Welcome to MazariBot!'
      });
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, message: 'Bot is not connected' });
    }
  } catch (error) {
    console.error(chalk.red('❌ Error sending completion message:'), error);
    res.status(500).json({ success: false, message: 'Failed to send completion message' });
  }
});

app.listen(port, () => {
  console.log(chalk.green(`🚀 MazariBot listening on port ${port}`));
});

