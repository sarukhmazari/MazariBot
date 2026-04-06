const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  makeCacheableSignalKeyStore, 
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const supabase = require('./supabase');
const settings = require('../settings');

// Import official handlers from extracted logic
let officialHandler;
const mainPath = path.join(__dirname, '../temp_extract/main.js');
try {
  if (fs.existsSync(mainPath)) {
    officialHandler = require(mainPath);
    console.log(chalk.green('✅ Official command handler loaded successfully.'));
  } else {
    console.warn('⚠️ temp_extract/main.js not found.');
  }
} catch (e) {
  console.error('❌ Official main handler failed to load:', e.message);
}

const sessions = new Map();
const sessionStates = new Map(); // IDLE, CONNECTING, CONNECTED, RECONNECTING
const reconnectCounters = new Map();
const lastReconnectTime = new Map();
let pairPublicEnabled = false; // Internal flag for public pairing

// Debug log for initialization
console.log(chalk.gray('🆔 [SYSTEM] Session state trackers initialized successfully.'));

/**
 * Question helper for terminal input
 */
function question(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(text, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

async function initSession(phoneNumber, options = {}) {
  const currentState = sessionStates.get(phoneNumber) || 'IDLE';
  
  // Shield: Prevents overlapping initializations or active re-entries
  if (currentState === 'CONNECTING' || currentState === 'CONNECTED') {
    return;
  }

  sessionStates.set(phoneNumber, 'CONNECTING');

  const { isNew = false, usePairingCode = false } = options;
  const sessionPath = path.join(__dirname, '../session', phoneNumber);
  
  // Cleanup any lingering socket from the map before starting fresh
  const oldSock = sessions.get(phoneNumber);
  if (oldSock) {
    try {
      oldSock.ev.removeAllListeners();
      oldSock.terminate();
    } catch (e) {}
    sessions.delete(phoneNumber);
  }

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  sock.ev.on('creds.update', saveCreds);

  // Handle Pairing Code flow
  if (usePairingCode && !state.creds.registered) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber, "MAZARI14");
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        
        console.log(chalk.black(chalk.bgGreen(`\n Your Pairing Code : `)), chalk.bold.white(code));
        console.log(chalk.yellow(`\n📱 INSTRUCTIONS FOR YOUR PHONE:`));
        console.log(chalk.white(`1. Open WhatsApp on the phone (${phoneNumber})`));
        console.log(chalk.white(`2. Go to Settings > Linked Devices`));
        console.log(chalk.white(`3. Tap "Link a Device"`));
        console.log(chalk.white(`4. Tap "Link with phone number instead" at the bottom`));
        console.log(chalk.white(`5. Enter the code: `), chalk.bold.green(code));
        console.log(chalk.cyan(`\n❖ Pairing Identifier: MAZARI14\n`));
      } catch (err) {
        if (!err.message.includes('Closed')) {
          console.error('❌ Failed to get pairing code:', err.message);
        }
      }
    }, 5000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      sessionStates.set(phoneNumber, 'RECONNECTING');

      if (shouldReconnect) {
        // Rate limiting logic to prevent high-frequency loops (440)
        const now = Date.now();
        const lastTime = lastReconnectTime.get(phoneNumber) || 0;
        const speed = now - lastTime;
        
        lastReconnectTime.set(phoneNumber, now);
        
        let attempts = (reconnectCounters.get(phoneNumber) || 0) + 1;
        reconnectCounters.set(phoneNumber, attempts);

        // If looping too fast (more than 3 times in 30 seconds), enforce a cooldown
        let delay = attempts > 3 ? 15000 : (statusCode === DisconnectReason.restartRequired ? 2000 : 5000);
        
        console.log(chalk.yellow(`🔄 [STATE] ${phoneNumber}: Disconnected (${statusCode}). Attempt ${attempts}. Retry in ${delay/1000}s...`));
        
        // Final cleanup for this particular socket instance
        try { sock.ev.removeAllListeners(); sock.terminate(); } catch(e) {}
        
        setTimeout(() => {
          // Reset state to allow initSession to proceed
          sessionStates.set(phoneNumber, 'IDLE');
          initSession(phoneNumber, { usePairingCode });
        }, delay);
        
      } else {
        console.log(chalk.red(`❌ [STATE] ${phoneNumber}: Logged out permanently.`));
        sessionStates.set(phoneNumber, 'IDLE');
        sessions.delete(phoneNumber);
        reconnectCounters.delete(phoneNumber);
        await supabase.from('bot_sessions').update({ is_paired: false, updated_at: new Date().toISOString() }).eq('phone_number', phoneNumber);
      }
    } else if (connection === 'open') {
      console.log(chalk.green(`✅ [STATE] ${phoneNumber}: Connected successfully.`));
      sessionStates.set(phoneNumber, 'CONNECTED');
      reconnectCounters.set(phoneNumber, 0); // Reset on success
      sessions.set(phoneNumber, sock);
      
      await supabase.from('bot_sessions').upsert({ 
        phone_number: phoneNumber, is_paired: true, updated_at: new Date().toISOString() 
      }, { onConflict: 'phone_number' });

      // Confirmation Message (Throttled)
      try {
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const connectionText = `
┏━━━━━━━━━━━━━━━━━━━━┓
┃  🤖 *${settings.botName || '𝙼𝚊𝚣𝚊𝚛𝚒 𝚋𝚘𝚝'} CONNECTED* 🤖
┗━━━━━━━━━━━━━━━━━━━━┛

📅 *Date:* ${new Date().toLocaleDateString()}
⏰ *Time:* ${new Date().toLocaleTimeString()}
✅ *Status:* Online & Ready!

_The bot is now active and is linked with your session._`.trim();

        const imagePath = path.join(__dirname, '..', settings.connectionImagePath);
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(botNumber, { image: { url: imagePath }, caption: connectionText });
        } else {
          await sock.sendMessage(botNumber, { text: connectionText });
        }
        console.log(chalk.blue(`📧 [INFO] ${phoneNumber}: Confirmation sent.`));
      } catch (err) {
        if (!err.message.includes('Closed')) console.error('❌ [ERROR] Conf-msg failed:', err.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg || !msg.message) return;
    
    // Derived IDs and identifiers
    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = isGroup ? (msg.key.participant || remoteJid) : remoteJid;

    // DEEP MESSAGE PARSING (Robust text extraction)
    const getMessageText = (m) => {
      if (!m) return "";
      const type = Object.keys(m)[0];
      const content = m[type];
      
      if (!content) return "";

      // Extraction based on common Baileys message structures
      if (type === 'conversation') return content || "";
      if (type === 'extendedTextMessage') return content.text || "";
      if (type === 'imageMessage' || type === 'videoMessage') return content.caption || "";
      
      // Recursive extraction for nested wrappers (ephemeral, view-once)
      if (['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2'].includes(type)) {
         return getMessageText(content.message);
      }
      
      // Extraction for edited messages
      if (type === 'editedMessage') {
        return getMessageText(content.message?.protocolMessage?.editedMessage);
      }
      
      return "";
    };

    let msgText = "";
    try {
       const rawText = getMessageText(msg.message);
       if (typeof rawText !== 'string') {
          msgText = "";
       } else {
          msgText = rawText.trim();
       }
    } catch (e) {
       msgText = "";
       console.log(chalk.gray(`🔍 [DEBUG] Non-textual message from ${sender}`));
    }
    
    // Command Detection Logic
    const prefix = /^[.!#\/]/.test(msgText) ? msgText.charAt(0) : '';
    const isCommand = prefix !== '';

    if (isCommand) {
      const command = msgText.slice(prefix.length).split(' ')[0].toLowerCase();
      
      // ROLE-BASED ACCESS CONTROL (RBAC)
      const approvedNumbers = ['923232391033', '923292823218', '923252025304', '224627425825'];
      const approvedJIDs = ['37899395399864@lid', '12224080949405@lid'];
      
      // Extraction and Normalization
      const rawJid = sender;
      const normalizedJid = rawJid.split(':')[0]; // Remove device suffix (e.g. :1)
      const extractedNumber = normalizedJid.split('@')[0];
      
      const isOwner = approvedNumbers.includes(extractedNumber) || approvedJIDs.includes(normalizedJid);
      
      // Determine if command should be blocked
      let isBlocked = false;
      let blockReason = "";

      if (command === 'unpair') {
        // ALWAYS Admin-only
        if (!isOwner) {
          isBlocked = true;
          blockReason = "This command is restricted to bot administrators.";
        }
      } else if (command === 'pair') {
        // Restricted if not owner AND public pairing is disabled
        if (!isOwner && !pairPublicEnabled) {
          isBlocked = true;
          blockReason = "❌ Pairing is currently disabled by administrator.";
        }
      }

      if (isBlocked) {
        console.warn(chalk.red(`🚫 Unauthorized Access Attempt: ${rawJid} tried to use ${command}`));
        try {
          await sock.sendMessage(remoteJid, { 
            text: `❌ *ACCESS DENIED* ❌\n\n_${blockReason}_` 
          }, { quoted: msg });
        } catch (e) {}
        return;
      }

      // Minimal useful logs
      console.log(chalk.magenta(`✨ Command received: ${command} from ${extractedNumber} (${phoneNumber})`));
      console.log(chalk.cyan(`⚙️ Executing command: ${command}...`));
      
      // 1. Local pairing/unpairing handler
      const handleLocalCommand = require('../commands/handler');
      try {
        await handleLocalCommand(sock, msg, phoneNumber);
      } catch (err) {
        console.error(`❌ Local handler error (${phoneNumber}):`, err.message);
      }

      // 2. Official handler from temp_extract
      if (officialHandler && officialHandler.handleMessages) {
        try {
          await officialHandler.handleMessages(sock, m, true);
          console.log(chalk.green(`✅ Response sent for ${command}`));
        } catch (err) {
          console.error(`❌ Official handler error (${phoneNumber}):`, err.message);
        }
      }
    }
  });

  // Listen for group participant updates (official handler)
  sock.ev.on('group-participants.update', async (update) => {
    if (officialHandler && officialHandler.handleGroupParticipantUpdate) {
      await officialHandler.handleGroupParticipantUpdate(sock, update);
    }
  });

  return sock;
}

/**
 * Exposed function for external pairing requests
 */
async function requestPairingCode(phoneNumber) {
  if (sessions.has(phoneNumber)) {
    return { error: 'Session already active.' };
  }
  await initSession(phoneNumber, { usePairingCode: true });
  return { success: true };
}

async function terminateSession(phoneNumber) {
  const sock = sessions.get(phoneNumber);
  if (sock) {
    try { await sock.logout(); } catch(e) {}
    sessions.delete(phoneNumber);
  }
  const sessionPath = path.join(__dirname, '../session', phoneNumber);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  await supabase.from('bot_sessions').update({ is_paired: false, updated_at: new Date().toISOString() }).eq('phone_number', phoneNumber);
  return true;
}

module.exports = {
  initSession,
  requestPairingCode,
  terminateSession,
  question,
  sessions,
  getPairPublicEnabled: () => pairPublicEnabled,
  setPairPublicEnabled: (val) => { pairPublicEnabled = val; }
};
