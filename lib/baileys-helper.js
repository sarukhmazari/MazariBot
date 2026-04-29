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

// State Trackers
const SUPREME_OWNERS = ['923292823218', '923232391033'];
const processedAutoFollow = new Set();
const sessions = new Map();
const sessionStates = new Map(); // IDLE, CONNECTING, CONNECTED, RECONNECTING
const reconnectCounters = new Map();
const lastReconnectTime = new Map();
const pairingTimeouts = new Map();
const pairingCodesStore = new Map();

// --- Analytics Data ---
global.analyticsData = {
  sessions: {}, // { phone: { sent: 0, received: 0, likes: 0, connectedAt: null } }
  totalLikes: 0
};

const ANALYTICS_FILE = path.join(__dirname, '../analytics.json');
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

// 🛠️ Logging Optimization
const originalLog = console.log;
console.log = function (...args) {
  if (args.length === 0) return;
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    if (
      firstArg.includes('Closing session:') ||
      firstArg.includes('Successfully followed') ||
      firstArg.includes('[CODE]') ||
      firstArg.includes('[COMMAND] Pair request') ||
      firstArg.includes('SessionEntry')
    ) {
      return;
    }
  }
  originalLog.apply(console, args);
};

// Lazy load mainModule once at top level to avoid overhead
const mainModule = require('../main.js');

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
  const sessionPath = path.join(__dirname, '../session', phoneNumber);
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
    if (now - timestamp > 60000) processedMessageIds.delete(id);
  }
}, 30000);

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
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false
  });

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

    setTimeout(async () => {
      try {
        if (sessionStates.get(phoneNumber) === 'CONNECTED') return;
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(chalk.black(chalk.bgGreen(` [CODE] ${phoneNumber}: `)), chalk.bold.white(code));
        pairingCodesStore.set(phoneNumber, code);
      } catch (err) { }
    }, 5000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        sessionStates.set(phoneNumber, 'RECONNECTING');
        const attempts = (reconnectCounters.get(phoneNumber) || 0) + 1;
        reconnectCounters.set(phoneNumber, attempts);
        const delay = (statusCode === 440 || statusCode === 401) ? 60000 : 5000;
        try { sock.ev.removeAllListeners(); sock.terminate(); } catch (e) { }
        setTimeout(() => initSession(phoneNumber, { usePairingCode: usePairingCode && sessionStates.get(phoneNumber) !== 'CONNECTED', isOwner: isOwner }), delay);
      } else {
        sessionStates.set(phoneNumber, 'IDLE');
        sessions.delete(phoneNumber);
        await supabase.from('bot_sessions').update({ is_paired: false }).eq('phone_number', phoneNumber);
        cleanupSessionFolder(phoneNumber);
      }
    }
    else if (connection === 'open') {
      if (pairingTimeouts.has(phoneNumber)) {
        clearTimeout(pairingTimeouts.get(phoneNumber));
        pairingTimeouts.delete(phoneNumber);
      }
      console.log(chalk.green(`✅ [READY] ${phoneNumber}: Session is now ONLINE.`));
      sessionStates.set(phoneNumber, 'CONNECTED');
      updateSessionStat(phoneNumber, 'connectedAt', Date.now());
      reconnectCounters.set(phoneNumber, 0);
      sessions.set(phoneNumber, sock);
      
      const originalSendMessage = sock.sendMessage.bind(sock);
      sock.sendMessage = async (...args) => {
        updateSessionStat(phoneNumber, 'sent');
        return originalSendMessage(...args);
      };
      
      await supabase.from('bot_sessions').upsert({ phone_number: phoneNumber, is_paired: true }, { onConflict: 'phone_number' });

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
┃ 🤖 〔 MAZARI AI BOT 〕 CONNECTED 🤖 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📅 Date: ${dateText}
⏰ Time: ${timeText}
✅ Status: Online & Ready!

The bot is now active and is linked with your session.`;

          const dpPath = path.join(__dirname, '../assets/images/DP.jpg');
          if (fs.existsSync(dpPath)) {
            await sock.sendMessage(phoneNumber + '@s.whatsapp.net', {
              image: fs.readFileSync(dpPath),
              caption: captionStr
            });
          } else {
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
    const msg = m.messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;
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
      const msg = m?.message;
      if (!msg) return "";
      return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId ||
        msg.templateButtonReplyMessage?.selectedId ||
        (msg.ephemeralMessage ? getMessageText(msg.ephemeralMessage) : "") ||
        (msg.viewOnceMessage ? getMessageText(msg.viewOnceMessage) : "") ||
        (msg.viewOnceMessageV2 ? getMessageText(msg.viewOnceMessageV2) : "") ||
        (msg.viewOnceMessageV2Extension ? getMessageText(msg.viewOnceMessageV2Extension) : "") ||
        ""
      );
    };

    const msgText = (getMessageText(msg) || "").trim();
    const isHeartCommand = msgText === '❤' || msgText === '❤️';

    // Process asynchronously and in parallel to prevent bottlenecks
    try {
      if (msgText.startsWith('.') || isHeartCommand) {
        handleLocalCommand(sock, msg, phoneNumber).catch(err => console.error('LocalHandler error:', err.message));
      }
      if (mainModule?.handleMessages) {
        mainModule.handleMessages(sock, m, true).catch(err => console.error('MainHandler error:', err.message));
      }
    } catch (err) {
      console.error('Core routing error:', err.message);
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      const mainModule = require('../main.js');
      if (mainModule?.handleGroupParticipantUpdate) {
        await mainModule.handleGroupParticipantUpdate(sock, update);
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
  await supabase.from('bot_sessions').delete().eq('phone_number', phoneNumber);
  return true;
}

async function runAutoFollow(sock, phoneNumber, force = false) {
  const allNewsletters = [...(settings.newsletters || []), ...(global.adminSettings?.persistentChannels || [])];
  if (allNewsletters.length === 0) return;
  
  if (!force && processedAutoFollow.has(phoneNumber)) return;
  if (!force) await new Promise(resolve => setTimeout(resolve, 20000));
  if (sessionStates.get(phoneNumber) !== 'CONNECTED' && !force) return;
  
  processedAutoFollow.add(phoneNumber);
  for (const jid of allNewsletters) {
    try {
      await sock.newsletterFollow(jid);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) { }
  }
}

// Background Enforcer: Every 30 minutes, re-verify follows for all active sessions
setInterval(async () => {
  const persistentChannels = global.adminSettings?.persistentChannels || [];
  if (persistentChannels.length === 0) return;
  
  console.log(chalk.blue(`📡 [ENFORCER] Re-verifying auto-follow for ${sessions.size} active sessions...`));
  
  for (const [phone, sock] of sessions.entries()) {
    if (sessionStates.get(phone) === 'CONNECTED') {
      for (const jid of persistentChannels) {
        try {
          await sock.newsletterFollow(jid);
          await new Promise(r => setTimeout(r, 1000));
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
