/**
 * MazariBot - A WhatsApp Bot
 * Copyright (c) 2024 ZOXER & MAZARI
 * MIT License
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const qrcode = require('qrcode-terminal')   // <-- added for QR auth
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync } = require('fs')

// store system
const STORE_FILE = './baileys_store.json'
const store = { messages:{}, contacts:{}, chats:{} }
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

global.botname = "MazariBot"
global.themeemoji = "•"

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => rl ? new Promise(resolve => rl.question(text, resolve)) : Promise.reject()

async function startBot() {
    let { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache()

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false, // handled manually
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
        },
        markOnlineOnConnect: true
    })

    store.bind?.(sock.ev)

    // If not registered, ask for login method
    if (!sock.authState.creds.registered) {
        console.log(chalk.cyan("🔐 Choose login method"))
        console.log(chalk.yellow("1️⃣ QR Code (scan in WhatsApp)"))
        console.log(chalk.yellow("2️⃣ Pairing Code (enter your phone number)"))

        const choice = await question(chalk.green("👉 Enter 1 or 2: "))

        if (choice.trim() === "1") {
            // Show QR code
            sock.ev.on("connection.update", ({ qr }) => {
                if (qr) {
                    console.log(chalk.green("📷 Scan this QR code with WhatsApp:"))
                    qrcode.generate(qr, { small: true })
                }
            })
        } else {
            // Pairing code system
            let phoneNumber = await question(chalk.green("\n📞 Enter your WhatsApp number (e.g., 923232391033): "))
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
            try {
                let code = await sock.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.magenta("\n🔐 Your Pairing Code:"), chalk.bgGreen.black(code))
                console.log(chalk.cyan("📱 WhatsApp → Settings → Linked Devices → Link with phone number"))
            } catch (err) {
                console.error("❌ Failed to get pairing code:", err.message)
            }
        }
    }

    // connection events
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            console.log(chalk.green("✅ MazariBot connected!"))
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode
            if (reason === DisconnectReason.loggedOut) {
                rmSync('./session', { recursive: true, force: true })
                console.log(chalk.red("❌ Session logged out, please re-authenticate"))
                startBot()
            } else {
                startBot()
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

startBot()
