const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, '../data/spamTracker.json');

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
        console.error('Error loading spam tracker:', e);
        return {};
    }
}

function saveTracker(data) {
    try {
        fs.writeFileSync(TRACKER_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving spam tracker:', e);
    }
}

/**
 * Checks if a user is marked as blocked or ignored in the spam tracker.
 * @param {string} jid - The user's JID.
 * @returns {boolean} - True if the user should be ignored.
 */
function isUserIgnored(jid) {
    const tracker = loadTracker();
    const userData = tracker[jid];
    return userData && (userData.blocked || userData.ignored);
}

async function handleSpamDetection(sock, jid, isMe, senderIsOwnerOrSudo, isGroup, getAutoblockStatus) {
    // If it's a group, ignore
    if (isGroup) return;

    // Load data
    let tracker = loadTracker();

    // If it's the bot itself sending a message (owner reply)
    if (isMe) {
        // If the bot (owner) sends a message to this JID, reset that user's count
        if (tracker[jid]) {
            // Only reset if they aren't actually blocked/ignored
            if (!tracker[jid].blocked && !tracker[jid].ignored) {
                delete tracker[jid];
                saveTracker(tracker);
            } else {
                // If they WERE blocked/ignored but owner replied, maybe we should un-ignore?
                // The requirements say "If owner replies -> reset user count"
                // Usually this implies unblocking if it was a simulated block.
                tracker[jid].count = 0;
                tracker[jid].blocked = false;
                tracker[jid].ignored = false;
                saveTracker(tracker);
            }
        }
        return;
    }

    // If it's an owner or sudo sending a message, ignore them from being tracked as spammers
    if (senderIsOwnerOrSudo) return;

    // Check if user is already blocked/ignored
    if (tracker[jid] && (tracker[jid].blocked || tracker[jid].ignored)) {
        return;
    }

    // Only proceed if autoblock is ON
    const isAutoblockOn = await getAutoblockStatus();
    if (!isAutoblockOn) return;

    const now = Date.now();
    const SPAM_LIMIT = 6;
    const RESET_TIME = 20 * 60 * 1000; // 20 minutes

    let userState = tracker[jid] || { count: 0, lastMessageTime: 0, blocked: false, ignored: false };

    // Reset if 20 minutes have passed
    if (now - userState.lastMessageTime > RESET_TIME) {
        userState.count = 0;
    }

    userState.count++;
    userState.lastMessageTime = now;
    tracker[jid] = userState;

    if (userState.count >= SPAM_LIMIT) {
        console.log(`🛡️ [SpamTracker] Handling spammer ${jid} (${userState.count} messages without reply)`);
        
        // Step 1: Try Real Block if JID ends with @s.whatsapp.net
        if (jid.endsWith('@s.whatsapp.net')) {
            try {
                // Inform user before blocking with requested wording
                await sock.sendMessage(jid, { text: '⚠️ Don\'t spam, otherwise you will be responsible!\n\n❌ You have been automatically blocked for spamming. Please wait for the owner to unblock you.' });
                await new Promise(r => setTimeout(r, 1000));
                
                await sock.updateBlockStatus(jid, 'block');
                userState.blocked = true;
                console.log(`✅ [SpamTracker] Successfully blocked spammer: ${jid}`);
            } catch (error) {
                console.error(`❌ [SpamTracker] Failed to block spammer ${jid}:`, error.message);
                // Fallback to simulated block if real block fails
                userState.blocked = true;
                userState.ignored = true;
            }
        } else {
            // Step 2: Fallback (if not blockable like @lid)
            try {
                await sock.sendMessage(jid, { text: '⚠️ Don\'t spam, otherwise you will be responsible!\n\n❌ You are now being ignored for spamming.' });
            } catch (e) {}

            userState.blocked = true;
            userState.ignored = true;
            console.log(`🛡️ [SpamTracker] Simulated block for non-blockable JID: ${jid}`);
        }

        tracker[jid] = userState;
    }

    saveTracker(tracker);
}

module.exports = { handleSpamDetection, isUserIgnored };
