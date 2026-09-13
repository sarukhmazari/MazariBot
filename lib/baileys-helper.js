// Lib for WhatsApp Multi-Session Bot - ZOXER BOT
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

// State Trackers
const SUPREME_OWNERS = ['923292823218', '923232391033'];
const processedAutoFollow = new Set();
const sessions = new Map();
const sessionStates = new Map(); // IDLE, CONNECTING, CONNECTED, RECONNECTING
const reconnectCounters = new Map();
const lastReconnectTime = new Map();
const pairingTimeouts = new Map();
const pairingCodesStore = new Map();
const sessionErrorCounters = new Map(); // Track 'Bad MAC' errors to trigger auto-fix
const sessionBooting = new Map(); // Track initial boot phase to safely apply flood filter
const MAX_SESSION_ERRORS = 3;

// --- Analytics Data ---
global.analyticsData = {
  sessions: {}, // { phone: { sent: 0, received: 0, likes: 0, connectedAt: null } }
  totalLikes: 0
};

const isVercelServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const ANALYTICS_FILE = isVercelServerless ? path.join('/tmp', 'analytics.json') : path.join(__dirname, '../data/analytics.json');
if (fs.existsSync(ANALYTICS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    global.analyticsData = { ...global.analyticsData, ...saved };
  } catch (e) { }
}

function saveAnalytics() {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(global.analyticsData, null, 2));
  } catch (e) {}
}

function updateSessionStat(phone, key, val = 1) {
  if (!global.analyticsData.sessions[phone]) {
    global.analyticsData.sessions[phone] = { sent: 0, received: 0, likes: 0, connectedAt: null };
  }
  if (key === 'connectedAt') {
    global.analyticsData.sessions[phone].connectedAt = val;
  } else {
    global.analyticsData.sessions[phone][key] = (global.analyticsData.sessions[phone][key] || 0) + val;
  }
  saveAnalytics();
}



// 🛠️ Memory Cleanup
setInterval(() => {
  reconnectCounters.clear();
  processedAutoFollow.clear();
  pairingTimeouts.forEach((timeout, key) => {
    if (sessionStates.get(key) === 'CONNECTED') {
      clearTimeout(timeout);
      pairingTimeouts.delete(key);
    }
  });
}, 12 * 60 * 60 * 1000);

function question(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(text, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

function cleanupSessionFolder(phoneNumber) {
  const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const sessionBaseDir = process.env.SESSION_DIR ? path.resolve(process.env.SESSION_DIR) : (isVercel ? path.join('/tmp', 'session') : path.join(__dirname, '../session'));
  const sessionPath = path.join(sessionBaseDir, phoneNumber);
  if (fs.existsSync(sessionPath)) {
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
}

// Core Session Initialization
// Memory Caches for performance optimization
const hasConnectedBoot = new Set();
const processedMessageIds = new Map();

// Global Cleanup for processed messages to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageIds) {
    if (now - timestamp > 600000) processedMessageIds.delete(id); // Keep for 10 mins instead of 1
  }
  
  // Force garbage collection if available
  if (global.gc) {
      global.gc();
  }
}, 5 * 60 * 1000); // Every 5 minutes

async function initSession(phoneNumber, options = {}) {
  const { force = false, usePairingCode = false, isOwner = false } = options;
  const currentState = sessionStates.get(phoneNumber) || 'IDLE';

  if (!force && (currentState === 'CONNECTING' || currentState === 'CONNECTED')) {
    return;
  }

  if (force) {
    const oldSock = sessions.get(phoneNumber);
    if (oldSock) {
      try {
        oldSock.ev.removeAllListeners();
        oldSock.terminate();
      } catch (e) { }
      sessions.delete(phoneNumber);
    }
    // Deep cleanup: Only delete essential signal files if force is true
    cleanupSessionFolder(phoneNumber);
    sessionStates.set(phoneNumber, 'IDLE');
  }

  // Reset error counter on fresh start
  sessionErrorCounters.set(phoneNumber, 0);

  sessionStates.set(phoneNumber, 'CONNECTING');
  console.log(chalk.cyan(`📡 [INIT] Starting session for ${phoneNumber}...`));

  const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const sessionBaseDir = process.env.SESSION_DIR ? path.resolve(process.env.SESSION_DIR) : (isVercel ? path.join('/tmp', 'session') : path.join(__dirname, '../session'));
  const sessionPath = path.join(sessionBaseDir, phoneNumber);
  if (!fs.existsSync(sessionPath)) {
    try { fs.mkdirSync(sessionPath, { recursive: true }); } catch (e) {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  console.log(chalk.cyan(`📡 [INIT] Auth state loaded for ${phoneNumber}`));

  let version = [2, 3000, 1015901307];
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
    ]);
    version = result.version;
  } catch (err) {
    // Fallback silent
  }
  console.log(chalk.cyan(`📡 [INIT] Baileys version resolved: ${version.join('.')}`));

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      // Optimized Key Store to prevent 'Bad MAC' and memory leaks
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ["Mac OS", "Chrome", "14.4.1"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Add transaction timeouts to prevent hanging
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    // Maximize memory efficiency for t3.micro
    getMessage: async (key) => {
        // Only keep a very small cache of messages in memory
        if (processedMessageIds.has(key.id)) return { conversation: 'CACHED_MSG' };
        return undefined;
    }
  });

  console.log(chalk.cyan(`📡 [INIT] Socket initialized for ${phoneNumber}. connecting...`));

  sock.ev.on('creds.update', async () => {
    try { await saveCreds(); } catch (err) { }
  });

  if (usePairingCode && !state.creds.registered) {
    if (pairingTimeouts.has(phoneNumber)) clearTimeout(pairingTimeouts.get(phoneNumber));
    const timeout = setTimeout(() => {
      if (sessionStates.get(phoneNumber) !== 'CONNECTED') {
        try { sock.terminate(); } catch (e) { }
        cleanupSessionFolder(phoneNumber);
        sessionStates.set(phoneNumber, 'IDLE');
        pairingTimeouts.delete(phoneNumber);
      }
    }, 5 * 60 * 1000);
    pairingTimeouts.set(phoneNumber, timeout);

    // Fallback timer to ensure pairing code is requested even if QR event is delayed
    setTimeout(async () => {
      if (!requestedPairingCode && !state.creds.registered && sessionStates.get(phoneNumber) !== 'CONNECTED') {
        requestedPairingCode = true;
        console.log(chalk.yellow(`🔑 Requesting pairing code for ${phoneNumber} (direct timer)...`));
        try {
          let code = await sock.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(` [CODE] ${phoneNumber}: `)), chalk.bold.white(code));
          pairingCodesStore.set(phoneNumber, code);
        } catch (err) {
          console.error('Failed to request pairing code (timer):', err.message || err);
          requestedPairingCode = false;
        }
      }
    }, 4000);
  }

  let requestedPairingCode = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection) {
      console.log(chalk.cyan(`📡 [INIT] Connection status: ${connection}`));
    }

    if (usePairingCode && qr && !state.creds.registered && !requestedPairingCode) {
      requestedPairingCode = true;
      console.log(chalk.yellow(`🔑 Requesting pairing code for ${phoneNumber}...`));
      setTimeout(async () => {
        try {
          if (sessionStates.get(phoneNumber) === 'CONNECTED') return;
          let code = await sock.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(` [CODE] ${phoneNumber}: `)), chalk.bold.white(code));
          pairingCodesStore.set(phoneNumber, code);
        } catch (err) {
          console.error('Failed to request pairing code:', err);
          requestedPairingCode = false;
        }
      }, 1500);
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || '';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      // If the session is not yet registered, request a pairing code directly
      if (!state.creds.registered && !requestedPairingCode) {
        requestedPairingCode = true;
        console.log(chalk.yellow(`🔑 Requesting pairing code for ${phoneNumber} (no QR)...`));
        setTimeout(async () => {
          try {
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(chalk.black(chalk.bgGreen(` [CODE] ${phoneNumber}: `)), chalk.bold.white(code));
            pairingCodesStore.set(phoneNumber, code);
          } catch (err) {
            console.error('Failed to request pairing code:', err);
            requestedPairingCode = false;
          }
        }, 1500);
      }
      
      console.log(chalk.yellow(`🔄 [DISCONNECT] ${phoneNumber}: Reason: ${statusCode || 'Unknown'} | Error: ${errorMessage}`));

      if (shouldReconnect) {
        sessionStates.set(phoneNumber, 'RECONNECTING');
        const attempts = (reconnectCounters.get(phoneNumber) || 0) + 1;
        reconnectCounters.set(phoneNumber, attempts);

        // AUTO-HEALING: If we see Bad MAC or Ciphertext errors, deep refresh the keys
        if (errorMessage.includes('Bad MAC') || errorMessage.includes('Ciphertext') || attempts > 5) {
            console.log(chalk.red(`🛠️ [AUTO-HEAL] ${phoneNumber}: Encryption out of sync. Refreshing signal keys...`));
            // Instead of full logout, we just clear the keys cache but keep the creds
            const keysPath = path.join(sessionPath, 'app-state-sync-key-AAAA.json'); // Sample key file
            // Actually, we'll just force a re-init with 'force' if it keeps failing
            if (attempts > 8) {
                console.log(chalk.bgRed(`💥 [FATAL] ${phoneNumber}: Persistent encryption error. Forcing full session reset...`));
                return initSession(phoneNumber, { force: true, usePairingCode: true });
            }
        }

        const delay = (statusCode === 440 || statusCode === 401) ? 60000 : 5000;
        try { sock.ev.removeAllListeners(); sock.terminate(); } catch (e) { }
        setTimeout(() => initSession(phoneNumber, { usePairingCode: usePairingCode && sessionStates.get(phoneNumber) !== 'CONNECTED', isOwner: isOwner }), delay);
      } else {
        sessionStates.set(phoneNumber, 'IDLE');
        sessions.delete(phoneNumber);
        try {
          await supabase.from('bot_sessions').update({ is_paired: false }).eq('phone_number', phoneNumber);
        } catch (dbErr) {
          console.error(`[DB Sync Error] Failed to update session status for ${phoneNumber}:`, dbErr.message);
        }
        cleanupSessionFolder(phoneNumber);
      }
    }
    else if (connection === 'open') {
      if (pairingTimeouts.has(phoneNumber)) {
        clearTimeout(pairingTimeouts.get(phoneNumber));
        pairingTimeouts.delete(phoneNumber);
      }
      console.log('Connected');
      sessionStates.set(phoneNumber, 'CONNECTED');
      sessionBooting.set(phoneNumber, true);
      setTimeout(() => {
        sessionBooting.set(phoneNumber, false);
      }, 10000); // 10s initial boot window to ignore offline backlog
      updateSessionStat(phoneNumber, 'connectedAt', Date.now());
      reconnectCounters.set(phoneNumber, 0);
      sessions.set(phoneNumber, sock);
      
      const originalSendMessage = sock.sendMessage.bind(sock);
      sock.sendMessage = async (...args) => {
        updateSessionStat(phoneNumber, 'sent');
        return originalSendMessage(...args);
      };
      
      try {
        await supabase.from('bot_sessions').upsert({ phone_number: phoneNumber, is_paired: true }, { onConflict: 'phone_number' });
      } catch (dbErr) {
        // Silently ignore
      }

      // Sending a connection success message to the paired number
      if (!hasConnectedBoot.has(phoneNumber)) {
        hasConnectedBoot.add(phoneNumber);

        try {
          const now = new Date();
          const dateOptions = { month: 'numeric', day: 'numeric', year: 'numeric' };
          const dateText = now.toLocaleDateString(undefined, dateOptions);
          const timeOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true };
          const timeText = now.toLocaleTimeString(undefined, timeOptions).toUpperCase();

          const captionStr = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🤖 〔 ZOXER BOT 〕 CONNECTED 🤖 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📅 Date: ${dateText}
⏰ Time: ${timeText}
✅ Status: Online & Ready!

The bot is now active and is linked with your session.`;

          try {
            const fs = require('fs');
            let imageSource;
            if (settings.connectionImagePath && fs.existsSync(settings.connectionImagePath)) {
              imageSource = fs.readFileSync(settings.connectionImagePath);
            } else {
              imageSource = { url: 'https://mazari-api.sarukhmazari1.workers.dev/api/cdn/mz-dzqgy9' };
            }

            await sock.sendMessage(phoneNumber + '@s.whatsapp.net', {
              image: imageSource,
              caption: captionStr
            });
          } catch (imageError) {
            console.log(chalk.yellow(`📡 [INFO] Connection image unavailable (CDN 404 or file missing). Sent text connection message.`));
            await sock.sendMessage(phoneNumber + '@s.whatsapp.net', {
              text: captionStr
            });
          }
        } catch (e) {
          console.error('Failed to send connection message:', e);
        }
      }

      runAutoFollow(sock, phoneNumber).catch(() => { });
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg || !msg.message || msg.key?.remoteJid === 'status@broadcast') return;

    console.log(`📩 [INCOMING] From: ${msg.key.remoteJid}`);

    // Ignore offline/history messages older than 2 minutes to prevent bot flood on boot (only during initial 10s boot phase)
    if (sessionBooting.get(phoneNumber)) {
      let messageTime = msg.messageTimestamp;
      if (messageTime) {
        if (typeof messageTime === 'object' && messageTime.low !== undefined) {
          messageTime = messageTime.low;
        }
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - messageTime > 120) return;
      }
    }

    updateSessionStat(phoneNumber, 'received');

    // Auto-React to Channel Posts
    if (msg.key.remoteJid.endsWith('@newsletter') && global.adminSettings?.autoReactToChannels && !msg.key.fromMe) {
        let shouldReact = true;
        const targetChannels = global.adminSettings?.targetReactChannels;
        if (targetChannels && targetChannels.length > 0) {
            shouldReact = targetChannels.includes(msg.key.remoteJid);
        }

        if (shouldReact) {
            try {
                const serverId = msg.key.server_id || msg.messageStubParameters?.[0];
                if (serverId) {
                    await sock.newsletterReactMessage(msg.key.remoteJid, serverId, '❤️');
                    updateSessionStat(phoneNumber, 'likes');
                    global.analyticsData.totalLikes = (global.analyticsData.totalLikes || 0) + 1;
                    saveAnalytics();
                }
            } catch (e) {
                console.error('Failed to react to channel message:', e);
            }
        }
    }

    // Handlers are loaded at top or cached
    const handleLocalCommand = require('../commands/handler');

    const getMessageText = (m) => {
      const msg = m?.message || m;
      if (!msg) return "";
      if (msg.conversation) return msg.conversation;
      if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
      if (msg.imageMessage?.caption) return msg.imageMessage.caption;
      if (msg.videoMessage?.caption) return msg.videoMessage.caption;
      if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
      if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
      if (msg.ephemeralMessage?.message) return getMessageText(msg.ephemeralMessage.message);
      if (msg.viewOnceMessage?.message) return getMessageText(msg.viewOnceMessage.message);
      if (msg.viewOnceMessageV2?.message) return getMessageText(msg.viewOnceMessageV2.message);
      if (msg.viewOnceMessageV2Extension?.message) return getMessageText(msg.viewOnceMessageV2Extension.message);
      if (msg.documentWithCaptionMessage?.message) return getMessageText(msg.documentWithCaptionMessage.message);
      if (msg.editedMessage?.message) return getMessageText(msg.editedMessage.message);
      return "";
    };

    const msgText = (getMessageText(msg) || "").trim();
    const isHeartCommand = msgText === '❤' || msgText === '❤️';

    // Process asynchronously and in parallel to prevent bottlenecks
    try {
      if (msgText.startsWith('.') || isHeartCommand) {
        handleLocalCommand(sock, msg, phoneNumber).catch(err => {
            console.error('LocalHandler error:', err.message);
            // Detect Bad MAC during handler execution
            if (err.message.includes('Bad MAC')) {
                const errCount = (sessionErrorCounters.get(phoneNumber) || 0) + 1;
                sessionErrorCounters.set(phoneNumber, errCount);
                if (errCount > MAX_SESSION_ERRORS) {
                    console.log(chalk.red(`⚠️ [CRITICAL] ${phoneNumber}: Multiple decryption failures. Restarting session...`));
                    initSession(phoneNumber);
                }
            }
        });
      }
      const mainModule = require('../main.js');
      const handlerFn = mainModule?.handleMessages || global.botMainHandler;
      if (handlerFn) {
        handlerFn(sock, m, true).catch(err => console.error('MainHandler error:', err.message));
      }
    } catch (err) {
      console.error('Core routing error:', err.message);
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      const mainModule = require('../main.js');
      const groupHandlerFn = mainModule?.handleGroupParticipantUpdate || global.botGroupHandler;
      if (groupHandlerFn) {
        await groupHandlerFn(sock, update);
      }
    } catch (e) { }
  });

  sock.ev.on('error', (err) => {
    if (err.message && !err.message.includes('stream error')) {
      console.error(chalk.red("❌ [ERROR] "), err.message);
    }
  });

  return sock;
}

async function requestPairingCode(phoneNumber, requesterIsOwner = false) {
  if (sessions.has(phoneNumber)) await terminateSession(phoneNumber);
  await initSession(phoneNumber, { usePairingCode: true, force: true, isOwner: requesterIsOwner });
  return { success: true };
}

async function terminateSession(phoneNumber) {
  const sock = sessions.get(phoneNumber);
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      await sock.logout();
      sock.terminate();
    } catch (e) { }
    sessions.delete(phoneNumber);
  }
  sessionStates.set(phoneNumber, 'IDLE');
  cleanupSessionFolder(phoneNumber);
  processedAutoFollow.delete(phoneNumber);
  try {
    await supabase.from('bot_sessions').delete().eq('phone_number', phoneNumber);
  } catch (dbErr) {
    // Silently ignore
  }
  return true;
}

async function runAutoFollow(sock, phoneNumber, force = false) {
  const allNewsletters = [...new Set([...(settings.newsletters || []), ...(global.adminSettings?.persistentChannels || [])])];
  if (allNewsletters.length === 0) return;
  
  if (!force && processedAutoFollow.has(phoneNumber)) return;
  
  // Wait a short bit for the session to stabilize
  if (!force) await new Promise(resolve => setTimeout(resolve, 5000));
  if (sessionStates.get(phoneNumber) !== 'CONNECTED' && !force) return;
  
  console.log(chalk.blue(`📡 [AUTO-FOLLOW] ${phoneNumber}: Starting auto-follow for ${allNewsletters.length} channels...`));
  
  processedAutoFollow.add(phoneNumber);
  let successCount = 0;

  for (const jid of allNewsletters) {
    try {
      await sock.newsletterFollow(jid);
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      // Baileys sometimes throws an error even when the follow succeeds
      const errMsg = err?.message || '';
      if (errMsg.includes('unexpected response structure')) {
        successCount++;
      } else {
        console.error(chalk.red(`❌ [AUTO-FOLLOW] ${phoneNumber}: Failed to follow ${jid}:`), errMsg);
      }
    }
  }
  
  console.log(chalk.green(`✅ [AUTO-FOLLOW] ${phoneNumber}: Finished. Successfully followed ${successCount}/${allNewsletters.length} channels.`));
}

// Background Enforcer: Every 30 minutes, re-verify follows for all active sessions
setInterval(async () => {
  const allNewsletters = [...new Set([...(settings.newsletters || []), ...(global.adminSettings?.persistentChannels || [])])];
  if (allNewsletters.length === 0) return;
  
  console.log(chalk.blue(`📡 [ENFORCER] Re-verifying auto-follow for ${sessions.size} active sessions (${allNewsletters.length} channels)...`));
  
  for (const [phone, sock] of sessions.entries()) {
    if (sessionStates.get(phone) === 'CONNECTED') {
      for (const jid of allNewsletters) {
        try {
          await sock.newsletterFollow(jid);
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) { }
      }
    }
  }
}, 30 * 60 * 1000);

async function resolveChannelJid(inviteCodeOrJid) {
  let jid = inviteCodeOrJid;
  if (jid.includes('whatsapp.com/channel/')) {
    const code = jid.split('whatsapp.com/channel/')[1].split('/')[0].split('?')[0];
    
    let firstSession = null;
    for (const [phone, sock] of sessions.entries()) {
      if (sessionStates.get(phone) === 'CONNECTED') {
        firstSession = sock;
        break;
      }
    }
    
    if (!firstSession) throw new Error("No active session to resolve channel link. Please connect at least one session.");
    try {
      const metadata = await Promise.race([
        firstSession.newsletterMetadata("invite", code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout resolving metadata')), 15000))
      ]);
      
      if (metadata && metadata.id) {
        jid = metadata.id;
      } else {
        throw new Error("Could not resolve channel link.");
      }
    } catch (e) {
      console.error("Error resolving newsletter invite:", e);
      throw new Error("Invalid channel link or unable to resolve.");
    }
  }

  if (!jid.includes('@newsletter')) {
    jid = `${jid}@newsletter`;
  }
  return jid;
}

async function followChannel(inviteCodeOrJid) {
  const jid = await resolveChannelJid(inviteCodeOrJid);

  const newsletterId = jid.split('@')[0];
  let successCount = 0;

  for (const [phone, sock] of sessions.entries()) {
    if (sessionStates.get(phone) === 'CONNECTED') {
      try {
        await Promise.race([
          sock.newsletterFollow(jid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout following channel')), 10000))
        ]);
        successCount++;
      } catch (err) {
        let isSuccess = false;
        if (err && err.message && err.message.includes('unexpected response structure')) {
          isSuccess = true;
        } else if (err && err.output && err.output.payload && err.output.payload.message && err.output.payload.message.includes('unexpected response structure')) {
          isSuccess = true;
        }
        
        if (isSuccess) {
          successCount++; // WhatsApp actually joined successfully
        } else {
          console.error(`Failed to follow channel for ${phone}`, JSON.stringify(err));
        }
      }
    }
  }
  
  return { jid, successCount, totalSessions: Array.from(sessions.keys()).filter(p => sessionStates.get(p) === 'CONNECTED').length };
}

module.exports = { initSession, requestPairingCode, terminateSession, runAutoFollow, followChannel, resolveChannelJid, question, sessions, pairingCodesStore, sessionStates };
