const fs = require('fs');
const path = require('path');
const { getAntispam } = require('./index');

const TRACKER_PATH = path.join(__dirname, '../data/antispamTracker.json');

function loadTracker() {
    try {
        if (!fs.existsSync(TRACKER_PATH)) {
            const dir = path.dirname(TRACKER_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(TRACKER_PATH, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
    } catch (e) {
        console.error('Error loading antispam tracker:', e);
        return {};
    }
}

function saveTracker(data) {
    try {
        fs.writeFileSync(TRACKER_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving antispam tracker:', e);
    }
}

async function handleAntispamDetection(sock, chatId, senderId, messageText, isGroup, isAdmin, senderIsOwnerOrSudo, message) {
    // Only works in groups
    if (!isGroup) return;

    // Ignore admins and owner/sudo
    if (isAdmin || senderIsOwnerOrSudo) return;

    // Only proceed if antispam is ON for this group
    const isAntispamOn = await getAntispam(chatId);
    if (!isAntispamOn) return;

    let tracker = loadTracker();
    if (!tracker[chatId]) tracker[chatId] = {};
    
    // Default threshold is 3 unless configured otherwise
    const THRESHOLD = (typeof isAntispamOn === 'string' && isAntispamOn !== 'on') ? parseInt(isAntispamOn) : 3;

    const userState = tracker[chatId][senderId] || { lastMessage: '', repeatCount: 0, lastTime: 0, messageKeys: [] };
    const now = Date.now();

    // Reset if message changes or after 1 minute of inactivity
    if (messageText !== userState.lastMessage || (now - userState.lastTime > 60000)) {
        userState.lastMessage = messageText;
        userState.repeatCount = 1;
        userState.messageKeys = [message.key];
    } else {
        userState.repeatCount++;
        userState.messageKeys = (userState.messageKeys || []);
        userState.messageKeys.push(message.key);
    }

    userState.lastTime = now;
    tracker[chatId][senderId] = userState;
    saveTracker(tracker);

    // Warning on 2nd repetition
    if (userState.repeatCount === 2) {
        await sock.sendMessage(chatId, { 
            text: `⚠️ @${senderId.split('@')[0]}, stop sending repeated messages! One more and you will be kicked.`, 
            mentions: [senderId] 
        }, { quoted: message });
    }

    // Action on 3rd repetition (or threshold)
    if (userState.repeatCount >= THRESHOLD) {
        console.log(`🛡️ [AntiSpam] Detecting repetition from ${senderId} in ${chatId} (${userState.repeatCount} times)`);
        
        try {
            // Delete the messages in the chain first
            for (const key of userState.messageKeys) {
                try {
                    await sock.sendMessage(chatId, { delete: key });
                } catch (delError) {
                    // Ignore deletion errors
                }
            }

            // Send kick notice
            await sock.sendMessage(chatId, { text: `❌ @${senderId.split('@')[0]} has been kicked for spamming repeated messages! All spam messages deleted.`, mentions: [senderId] });
            
            // Wait a bit
            await new Promise(r => setTimeout(r, 1000));
            
            // Kick the user
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            
            console.log(`✅ [AntiSpam] Successfully kicked spammer: ${senderId} from ${chatId}`);
            
            // Clear their tracker state for this group
            delete tracker[chatId][senderId];
            saveTracker(tracker);
        } catch (error) {
            console.error(`❌ [AntiSpam] Failed to kick spammer ${senderId}:`, error.message);
        }
    }
}

module.exports = { handleAntispamDetection };
