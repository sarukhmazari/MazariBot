const { setStatusRestriction, getStatusRestriction } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

/**
 * Handles the .status on/off command.
 * Controls whether members are allowed to mention the group (by link) in their status.
 */
async function statusCommand(sock, chatId, senderId, args, message) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: 'This command can only be used in groups!' }, { quoted: message });
    }

    // Admin check
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
    const isOwner = message.key.fromMe;
    
    if (!isSenderAdmin && !isOwner) {
        return sock.sendMessage(chatId, { text: '❌ Only group admins can use the .status command.' }, { quoted: message });
    }

    const setting = args[0]?.toLowerCase();

    if (setting === 'on') {
        // Status ON = Mentions allowed
        await setStatusRestriction(chatId, true);
        await sock.sendMessage(chatId, { 
            text: '✅ *Group Mention Status: ON*\n\nEveryone is now allowed to mention this group in their status updates.' 
        }, { quoted: message });
    } else if (setting === 'off') {
        // Status OFF = Mentions restricted
        await setStatusRestriction(chatId, false);
        await sock.sendMessage(chatId, { 
            text: '❌ *Group Mention Status: OFF*\n\nMembers are now restricted from mentioning this group in their status updates. Bot will monitor and act on violations.' 
        }, { quoted: message });
    } else {
        const current = await getStatusRestriction(chatId);
        await sock.sendMessage(chatId, { 
            text: `📊 *Current Status:* ${current ? 'ON (Allowed)' : 'OFF (Restricted)'}\n\n*Usage:* \n.status on - Allow mentions\n.status off - Restrict mentions` 
        }, { quoted: message });
    }
}

module.exports = statusCommand;
