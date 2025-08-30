/**
 * MazariBot - A WhatsApp Bot
 * Copyright (c) 2024
 * MIT License
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
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) =>
  rl ? new Promise((resolve) => rl.question(text, resolve))
     : Promise.reject(new Error('Non-interactive terminal'))

// ==== GLOBAL FLAGS ====
let restarting = false

async function startBot () {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const msgRetryCounterCache = new NodeCache()

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    // We’ll control QR manually
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
    },
    markOnlineOnConnect: true
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
          console.log(chalk.cyan('WhatsApp → Settings → Linked Devices → Link with phone number'))
        } catch (err) {
          console.error(chalk.red('❌ Failed to request pairing code via PHONE_NUMBER:'), err?.message || err)
          console.error(chalk.yellow('Set a correct PHONE_NUMBER (no +, include country code).'))
        }
      } else {
        // No phone number on server; QR isn’t scannable easily from cloud logs, but print anyway
        console.log(chalk.yellow('PHONE_NUMBER not set. Printing QR string to logs (best for local dev).'))
        sock.ev.on('connection.update', ({ qr }) => {
          if (qr) console.log('QR (string):', qr)
        })
      }
    } else {
      // Local/dev: let user choose
      console.log(chalk.cyan('🔐 Choose login method'))
      console.log(chalk.yellow('1️⃣  QR Code (scan in WhatsApp)'))
      console.log(chalk.yellow('2️⃣  Pairing Code (enter your phone number)'))
      const choice = (await question(chalk.green('👉 Enter 1 or 2: '))).trim()

      if (choice === '1') {
        sock.ev.on('connection.update', ({ qr }) => {
          if (qr) {
            console.log(chalk.green('📷 Scan this QR with WhatsApp:'))
            qrcode.generate(qr, { small: true })
          }
        })
      } else {
        let pn = await question(chalk.green('\n📞 Enter your WhatsApp number (e.g., 923232391033): '))
        pn = pn.replace(/[^0-9]/g, '')
        try {
          let code = await sock.requestPairingCode(pn)
          code = code?.match(/.{1,4}/g)?.join('-') || code
          console.log(chalk.magenta('\n🔐 Pairing Code:'), chalk.bgGreen.black(code))
          console.log(chalk.cyan('WhatsApp → Settings → Linked Devices → Link with phone number'))
        } catch (err) {
          console.error('❌ Failed to get pairing code:', err?.message || err)
          console.log("Retrying in 5 seconds...")
          await delay(5000)
          startBot().catch(e => console.error("Error on restart:", e))
        }
      }
    }
  }

  // ===== CONNECTION EVENTS =====
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(chalk.green('✅ MazariBot connected!'))
      if (rl) rl.close()
    }

    if (connection === 'close') {
      const status = new Boom(lastDisconnect?.error)?.output?.statusCode
      const text = DisconnectReason[status] || status

      console.log(chalk.yellow(`Connection closed. Reason: ${text}.`))

      // Cleanup on loggedOut to force full re-auth
      if (status === DisconnectReason.loggedOut || status === 401) {
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }) } catch {}
        console.log(chalk.red('Session removed. Will require re-link.'))
      }

      // Backoff & restart once
      if (!restarting) {
        restarting = true
        console.log(chalk.gray(`Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`))
        await delay(RECONNECT_DELAY_MS)
        restarting = false
        startBot().catch(e => console.error('Restart error:', e))
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  return sock
}

// ====== PROCESS-LEVEL SAFETY NETS ======
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  UnhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('⚠️  UncaughtException:', err)
})

startBot().catch((err) => {
  console.error(chalk.red('❌ Fatal startup error:'), err)
  process.exit(1)
})
