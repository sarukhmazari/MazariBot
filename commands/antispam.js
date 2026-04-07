const { setAntispam, getAntispam } = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');
const isAdmin = require('../lib/isAdmin');

async function antispamCommand(sock, chatId, senderId, args, message) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
        return;
    }

    const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);
    const adminStatus = await isAdmin(sock, chatId, senderId);
    
    if (!message.key.fromMe && !senderIsOwnerOrSudo && !adminStatus.isSenderAdmin) {
        await sock.sendMessage(chatId, { text: '❌ Only group admins or bot owner can use this command.' }, { quoted: message });
        return;
    }

    const action = args[0]?.toLowerCase();
    const limit = parseInt(args[0]);

    if (!isNaN(limit) && limit > 1) {
        await setAntispam(chatId, limit);
        await sock.sendMessage(chatId, { text: `✅ Group Anti-Spam is now *ENABLED* with a threshold of *${limit}* messages.\n\nUsers sending ${limit} identical messages consecutively will be kicked.` }, { quoted: message });
    } else if (action === 'on') {
        await setAntispam(chatId, true); // This will default to 3
        await sock.sendMessage(chatId, { text: '✅ Group Anti-Spam is now *ENABLED* for this group.\n\nUsers who send 3 identical messages consecutively will be kicked.' }, { quoted: message });
    } else if (action === 'off') {
        await setAntispam(chatId, false);
        await sock.sendMessage(chatId, { text: '✅ Group Anti-Spam is now *DISABLED*.' }, { quoted: message });
    } else {
        const currentLimit = await getAntispam(chatId);
        await sock.sendMessage(chatId, { 
            text: `🛡️ *Anti-Spam Status:* ${currentLimit ? `ENABLED (Limit: ${currentLimit})` : 'DISABLED'}\n\nUsage:\n.antispam on\n.antispam off\n.antispam <number>` 
        }, { quoted: message });
    }
}

module.exports = antispamCommand;
