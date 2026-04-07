const { isJidGroup } = require('@whiskeysockets/baileys');
const { getAntilink, incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const config = require('../config');

const WARN_COUNT = config.WARN_COUNT || 3;

// In-memory cache for group antilink settings to avoid frequent disk I/O
const settingsCache = new Map(); // chatId -> { config: object, timestamp: number }
const SETTINGS_CACHE_TTL = 30 * 1000; // 30 seconds

// In-memory link flood tracker for instant protection
const linkFloodTracker = new Map(); // chatId_senderId -> { count: number, resetTime: number }
const FLOOD_THRESHOLD = 3;
const FLOOD_WINDOW = 10000; // 10 seconds

/**
 * Checks if a string contains a URL.
 */
function containsURL(str) {
    const urlRegex = /(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;
    return urlRegex.test(str);
}

/**
 * Gets antilink settings with in-memory caching.
 */
async function getCachedAntilink(chatId) {
    const now = Date.now();
    const cached = settingsCache.get(chatId);
    
    if (cached && (now - cached.timestamp) < SETTINGS_CACHE_TTL) {
        return cached.config;
    }
    
    const antilinkConfig = await getAntilink(chatId, 'on');
    settingsCache.set(chatId, { config: antilinkConfig, timestamp: now });
    return antilinkConfig;
}

/**
 * Handles the Antilink functionality for group chats.
 * Optimized for speed and consistent warn-then-kick behavior.
 */
async function Antilink(msg, sock) {
    const chatId = msg.key.remoteJid;
    if (!chatId || !isJidGroup(chatId)) return;

    // 1. Fast path: Extract text and check for link before heavy work
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || 
                 msg.message?.videoMessage?.caption || '';
                 
    if (!text || !containsURL(text)) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    if (!sender || msg.key.fromMe) return;

    // 2. Fetch config (fast cached path)
    const antilinkConfig = await getCachedAntilink(chatId);
    if (!antilinkConfig) return;

    // 3. Permission checks (Sudo & Admin)
    const senderIsSudo = await isSudo(sender);
    if (senderIsSudo) return;

    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, sender);
    if (isSenderAdmin || !isBotAdmin) return;

    // 4. Flood detection (3 in 10s)
    const floodKey = `${chatId}_${sender}`;
    const now = Date.now();
    let floodData = linkFloodTracker.get(floodKey);

    if (!floodData || now > floodData.resetTime) {
        floodData = { count: 1, resetTime: now + FLOOD_WINDOW };
    } else {
        floodData.count++;
    }
    linkFloodTracker.set(floodKey, floodData);

    try {
        // 5. PRIORITY: Remove link immediately
        await sock.sendMessage(chatId, { delete: msg.key });
        
        // 6. Check for instant flood kick first
        if (floodData.count >= FLOOD_THRESHOLD) {
            linkFloodTracker.delete(floodKey);
            await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
            await resetWarningCount(chatId, sender);
            await sock.sendMessage(chatId, {
                text: `\`\`\`@${sender.split('@')[0]} has been instantly kicked for flooding links! 🚫\`\`\``,
                mentions: [sender]
            });
            return;
        }

        // 7. Progressive Warning System (as requested)
        const warningCount = await incrementWarningCount(chatId, sender);
        
        if (warningCount >= WARN_COUNT) {
            await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
            await resetWarningCount(chatId, sender);
            await sock.sendMessage(chatId, {
                text: `\`\`\`@${sender.split('@')[0]} has been kicked after reaching maximum warnings (${WARN_COUNT}/3) 🚫\`\`\``,
                mentions: [sender]
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `\`\`\`@${sender.split('@')[0]} warning ${warningCount}/${WARN_COUNT} for sending links! (Kick at ${WARN_COUNT}) ⚠️\`\`\``,
                mentions: [sender]
            });
        }
    } catch (error) {
        console.error('Error in Antilink warn-system:', error);
    }
}

module.exports = { Antilink };