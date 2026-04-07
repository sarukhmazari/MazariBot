const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');
const isAdmin = require('../lib/isAdmin');

const statusPath = path.join(__dirname, '../data/smartReply.json');

function getStatus() {
    try {
        if (!fs.existsSync(statusPath)) return { enabled: false };
        return JSON.parse(fs.readFileSync(statusPath));
    } catch (e) {
        return { enabled: false };
    }
}

function setStatus(enabled) {
    try {
        const dir = path.dirname(statusPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(statusPath, JSON.stringify({ enabled }));
        return true;
    } catch (e) {
        return false;
    }
}

async function smartreplyCommand(sock, chatId, message, args, senderId, isGroup) {
    const sub = (args[0] || '').toLowerCase();
    
    // Permission: Owner (Global toggle) or Admin (if per-group, but user suggested Global recommended)
    // I'll stick to Owner for global toggle as per .mode and other global settings
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (sub === 'on') {
        if (!isOwner) return await sock.sendMessage(chatId, { text: '❌ Only owner can toggle SmartReply globally.' }, { quoted: message });
        setStatus(true);
        await sock.sendMessage(chatId, { text: '✅ Smart auto-replies enabled' }, { quoted: message });
    } else if (sub === 'off') {
        if (!isOwner) return await sock.sendMessage(chatId, { text: '❌ Only owner can toggle SmartReply globally.' }, { quoted: message });
        setStatus(false);
        await sock.sendMessage(chatId, { text: '❌ Smart auto-replies disabled' }, { quoted: message });
    } else if (sub === 'status') {
        const state = getStatus().enabled ? 'ON' : 'OFF';
        await sock.sendMessage(chatId, { text: `⚙️ SmartReply is currently: ${state}` }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: '❓ Usage:\n.smartreply on\n.smartreply off\n.smartreply status' }, { quoted: message });
    }
}

module.exports = { smartreplyCommand, getStatus };
