// Lib for WhatsApp Multi-Session Bot - MAZARI BOT
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

const SUPREME_OWNERS = ['923292823218', '923232391033'];

// Track who has already completed auto-follow in this process lifecycle
const processedAutoFollow = new Set();

// Silence verbose library logs and specific bot messages
const originalLog = console.log;
console.log = function(...args) {
  if (typeof args[0] === 'string') {
    const msg = args[0];
    if (msg.startsWith('Closing session:') || 
        msg.includes('Successfully followed') || 
        msg.includes('[CODE]') || 
        msg.includes('[COMMAND] Pair request') || 
        msg.includes('Command used in')) {
      return;
    }
  }
  originalLog.apply(console, args);
};

// Import official handlers from extracted logic
let officialHandler;
const mainPath = path.join(__dirname, '../temp_extract/main.js');
try {
  if (fs.existsSync(mainPath)) {
    officialHandler = require(mainPath);
    console.log(chalk.green('✅ [MODULAR] Official command handler loaded.'));
  }
} catch (e) {
  console.error('❌ [ERROR] Official main handler failed to load:', e.message);
}

const sessions = new Map();
const sessionStates = new Map(); // IDLE, CONNECTING, CONNECTED, RECONNECTING
const reconnectCounters = new Map();
const lastReconnectTime = new Map();
const pairingTimeouts = new Map(); // To cleanup abandoned pairs

console.log(chalk.gray('🆔 [SYSTEM] Multi-session state trackers initialized.'));

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

/**
 * Robustly clean up a session folder
 */
function cleanupSessionFolder(phoneNumber) {
  const sessionPath = path.join(__dirname, '../session', phoneNumber);
  if (fs.existsSync(sessionPath)) {
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(chalk.gray(`🗑️ [CLEANUP] Removed folder for ${phoneNumber}`));
      return true;
    } catch (e) {
      console.error(`❌ [CLEANUP] Failed to remove folder for ${phoneNumber}:`, e.message);
      return false;
    }
  }
  return true;
}

/**
 * Core Session Initialization
 */
async function initSession(phoneNumber, options = {}) {
  const { force = false, usePairingCode = false, isOwner = false } = options;
  const currentState = sessionStates.get(phoneNumber) || 'IDLE';
  
  // If not forcing AND already working, just return
  if (!force && (currentState === 'CONNECTING' || currentState === 'CONNECTED')) {
    console.log(chalk.blue(`ℹ️ [INFO] Session ${phoneNumber} already active (${currentState}). Use force to reset.`));
    return;
  }

  // Deep Cleanup ONLY if 'force' is true
  if (force) {
    console.log(chalk.yellow(`🔄 [RESET] Forced initialization for ${phoneNumber}...`));
    const oldSock = sessions.get(phoneNumber);
    if (oldSock) {
      try {
        oldSock.ev.removeAllListeners();
        oldSock.terminate();
      } catch (e) {}
      sessions.delete(phoneNumber);
    }
    cleanupSessionFolder(phoneNumber);
    sessionStates.set(phoneNumber, 'IDLE');
  }

  sessionStates.set(phoneNumber, 'CONNECTING');
  console.log(chalk.cyan(`📡 [INIT] Starting session for ${phoneNumber}...`));

  const sessionPath = path.join(__dirname, '../session', phoneNumber);
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
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      // Ignore errors if session was just wiped
      if (!err.message.includes('ENOENT')) {
        console.error(`❌ [AUTH ERROR] Creds save failed for ${phoneNumber}:`, err.message);
      }
    }
  });

  // Handle Pairing Code flow
  if (usePairingCode && !state.creds.registered) {
    console.log(chalk.yellow(`🔢 [PAIR] Requesting code for ${phoneNumber}...`));
    
    // Safety timeout: If pairing doesn't succeed in 5 minutes, kill it
    // We clear and recreate this to ensure it captures the LATEST 'sock' instance
    if (pairingTimeouts.has(phoneNumber)) {
      clearTimeout(pairingTimeouts.get(phoneNumber));
    }
    
    const timeout = setTimeout(() => {
      if (sessionStates.get(phoneNumber) !== 'CONNECTED') {
        console.log(chalk.red(`⏰ [TIMEOUT] Pairing timed out for ${phoneNumber}. Cleaning up...`));
        try { sock.terminate(); } catch(e) {}
        cleanupSessionFolder(phoneNumber);
        sessionStates.set(phoneNumber, 'IDLE');
        pairingTimeouts.delete(phoneNumber);
      }
    }, 5 * 60 * 1000); 
    pairingTimeouts.set(phoneNumber, timeout);

    // Only request code if we're not currently online
    if (sessionStates.get(phoneNumber) !== 'CONNECTED') {
      setTimeout(async () => {
        try {
          if (sessionStates.get(phoneNumber) === 'CONNECTED') return;
          let code = await sock.requestPairingCode(phoneNumber, "MAZARI14");
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(` [CODE] ${phoneNumber}: `)), chalk.bold.white(code));
        } catch (err) {
          if (!err.message.includes('Closed')) {
            console.error(chalk.red(`❌ [PAIR] Failed to get code for ${phoneNumber}:`), err.message);
          }
        }
      }, 5000);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(chalk.gray(`🔌 [CONN] ${phoneNumber} closed with status ${statusCode}. Reconnect: ${shouldReconnect}`));

      if (shouldReconnect) {
        sessionStates.set(phoneNumber, 'RECONNECTING');
        
        // Special handling for status 515 (restart required)
        const isRestart = statusCode === 515;
        const attempts = isRestart ? 0 : (reconnectCounters.get(phoneNumber) || 0) + 1;
        if (!isRestart) reconnectCounters.set(phoneNumber, attempts);

        const delay = isRestart ? 2000 : Math.min(attempts * 5000, 30000);
        
        if (isRestart) {
          console.log(chalk.blue(`🔌 [CONN] ${phoneNumber}: Restart required (515). Restarting...`));
        } else {
          console.log(chalk.yellow(`🔄 [RETRY] ${phoneNumber}: Attempt ${attempts} in ${delay/1000}s...`));
        }
        
        try { sock.ev.removeAllListeners(); sock.terminate(); } catch(e) {}
        
        setTimeout(() => {
          // Restart WITHOUT force to preserve pairing progress
          initSession(phoneNumber, { usePairingCode: usePairingCode && sessionStates.get(phoneNumber) !== 'CONNECTED' });
        }, delay);
        
      } else {
        console.log(chalk.red(`❌ [LOGOUT] ${phoneNumber}: Permanently disconnected.`));
        sessionStates.set(phoneNumber, 'IDLE');
        sessions.delete(phoneNumber);
        reconnectCounters.delete(phoneNumber);
        
        // Clean database and folder
        await supabase.from('bot_sessions').update({ 
          is_paired: false, 
          updated_at: new Date().toISOString() 
        }).eq('phone_number', phoneNumber);
        
        cleanupSessionFolder(phoneNumber);
      }
    } 
    else if (connection === 'open') {
      // Clear safety timeout if it exists
      if (pairingTimeouts.has(phoneNumber)) {
        clearTimeout(pairingTimeouts.get(phoneNumber));
        pairingTimeouts.delete(phoneNumber);
      }

      console.log(chalk.green(`✅ [READY] ${phoneNumber}: Session is now ONLINE.`));
      sessionStates.set(phoneNumber, 'CONNECTED');
      reconnectCounters.set(phoneNumber, 0);
      sessions.set(phoneNumber, sock);
      
      // PERSIST SUCCESS TO DB
      await supabase.from('bot_sessions').upsert({ 
        phone_number: phoneNumber, 
        is_paired: true, 
        updated_at: new Date().toISOString() 
      }, { onConflict: 'phone_number' });

      // Confirmation to user
      try {
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US');
        const timeStr = now.toLocaleTimeString('en-US', { hour12: true });

        const connectionText = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  🤖 ${settings.botName || '〔 𝗠𝗔𝗭𝗔𝗥𝗜  𝗔𝗜  𝗕𝗢𝗧 〕'} CONNECTED 🤖
┗━━━━━━━━━━━━━━━━━━━━┛

📅 Date: ${dateStr}
⏰ Time: ${timeStr}
✅ Status: Online & Ready!

The bot is now active and is linked with your session.`;

        const imagePath = path.join(__dirname, '../assets/images/DP.jpg');
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(botNumber, { 
            image: fs.readFileSync(imagePath), 
            caption: connectionText 
          });
        } else {
          await sock.sendMessage(botNumber, { text: connectionText });
        }
        
        // --- AUTO-FOLLOW SYSTEM ---
        if (!processedAutoFollow.has(phoneNumber)) {
          runAutoFollow(sock, phoneNumber).catch(() => {});
        }
        
      } catch (err) {
        console.error(`❌ [ERROR] Failed to send connection report for ${phoneNumber}:`, err.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg || !msg.message) return;
    
    // Command Parser
    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = isGroup ? (msg.key.participant || remoteJid) : remoteJid;

    const getMessageText = (msg) => {
      const m = msg.message;
      if (!m) return "";
      const type = Object.keys(m)[0];
      const content = m[type];
      if (type === 'conversation') return content;
      if (type === 'extendedTextMessage') return content.text;
      if (type === 'imageMessage' || type === 'videoMessage') return content.caption;
      if (['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2'].includes(type)) return getMessageText({message: content.message});
      return "";
    };

    const msgText = (getMessageText(msg) || "").trim();
    if (!msgText.startsWith('.')) return;

    const command = msgText.slice(1).split(' ')[0].toLowerCase();
    const extractedNumber = sender.split(':')[0].split('@')[0];
    const isOwner = SUPREME_OWNERS.includes(extractedNumber);
    
    // Shared Command Logic (Pairing/Unpairing)
    const handleLocalCommand = require('../commands/handler');
    try {
      await handleLocalCommand(sock, msg, phoneNumber);
    } catch (err) {
      console.error(`❌ [ERROR] Local handler (${phoneNumber}):`, err.message);
    }

    // Official Module Handler
    if (officialHandler && officialHandler.handleMessages) {
      try {
        await officialHandler.handleMessages(sock, m, true);
      } catch (err) {}
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    if (officialHandler && officialHandler.handleGroupParticipantUpdate) {
      await officialHandler.handleGroupParticipantUpdate(sock, update);
    }
  });

  sock.ev.on('error', (err) => {
    console.error(chalk.red("❌ [ERROR] "), err.message || err);
  });

  return sock;
}

/**
 * Public/Command Interface
 */
async function requestPairingCode(phoneNumber, requesterIsOwner = false) {
  console.log(chalk.blue(`📥 [REQUEST] Pairing requested for ${phoneNumber}. Owner: ${requesterIsOwner}`));
  
  // If number already exists in active sessions, terminate and clean it first
  if (sessions.has(phoneNumber) || fs.existsSync(path.join(__dirname, '../session', phoneNumber))) {
    console.log(chalk.yellow(`🛠️ [MAINT] Number ${phoneNumber} has existing session. Force replacing...`));
    await terminateSession(phoneNumber);
  }

  // Double check DB to ensure no stale record blocks it
  await supabase.from('bot_sessions').delete().eq('phone_number', phoneNumber);

  // Initialize with Pairing Mode
  await initSession(phoneNumber, { usePairingCode: true, force: true, isOwner: requesterIsOwner });
  return { success: true };
}

async function terminateSession(phoneNumber) {
  console.log(chalk.red(`📤 [TERMINATE] Removing session ${phoneNumber}...`));
  
  const sock = sessions.get(phoneNumber);
  if (sock) {
    try { 
      sock.ev.removeAllListeners();
      await sock.logout(); 
      sock.terminate();
    } catch(e) {}
    sessions.delete(phoneNumber);
  }
  
  sessionStates.set(phoneNumber, 'IDLE');
  cleanupSessionFolder(phoneNumber);
  processedAutoFollow.delete(phoneNumber);
  
  // Update DB
  await supabase.from('bot_sessions').delete().eq('phone_number', phoneNumber);
  
  console.log(chalk.green(`✨ [SUCCESS] Session ${phoneNumber} wiped.`));
  return true;
}

/**
 * Newsletter Auto-Follow Utility
 */
async function runAutoFollow(sock, phoneNumber, force = false) {
  if (!settings.newsletters || !Array.isArray(settings.newsletters) || settings.newsletters.length === 0) {
    console.log(chalk.red(`⚠️ [AUTO] No newsletters defined in settings.js for ${phoneNumber}`));
    return;
  }
  
  if (!force && processedAutoFollow.has(phoneNumber)) {
    return;
  }

  // Let the session stabilize for 10 seconds before hitting the server
  if (!force) {
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // Checking again if session is still alive after delay
  if (sessionStates.get(phoneNumber) !== 'CONNECTED' && !force) {
    return;
  }

  processedAutoFollow.add(phoneNumber);
  console.log(chalk.blue(`📡 [AUTO] Starting AutoFollow for ${phoneNumber}...`));

  for (const jid of settings.newsletters) {
      try {
          const newsletterId = jid.split('@')[0];
          await sock.query({
              tag: 'iq',
              attrs: { to: '@s.whatsapp.net', xmlns: 'w:mex', type: 'set' },
              content: [{
                  tag: 'query',
                  attrs: { query_id: '6643657732292923' },
                  content: JSON.stringify({
                      variables: {
                          newsletter_id: newsletterId,
                          updates: { following_state: 'FOLLOWING' },
                      },
                  }),
              }],
          });
          console.log(chalk.green(`✅ [AUTO] Successfully followed ${jid} for ${phoneNumber}`));
          // Safety gap between follows
          await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
          if (err.message.includes('409')) {
              console.log(chalk.blue(`ℹ️ [AUTO] Already following ${jid} for ${phoneNumber}`));
          } else {
              console.error(chalk.red(`❌ [AUTO] Failed to follow ${jid} for ${phoneNumber}:`), err.message);
          }
      }
  }
  console.log(chalk.green(`✨ [AUTO] Success AutoFollow Channels for ${phoneNumber}!.`));
}

module.exports = {
  initSession,
  requestPairingCode,
  terminateSession,
  runAutoFollow,
  question,
  sessions
};
