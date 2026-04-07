const { setAutoblock, getAutoblock } = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');

async function autoblockCommand(sock, chatId, senderId, args, message) {
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    if (!isOwner) {
        await sock.sendMessage(chatId, { text: '❌ This command is only available for the bot owner.' }, { quoted: message });
        return;
    }

    const action = args[0]?.toLowerCase();
    if (action === 'on') {
        await setAutoblock(true);
        await sock.sendMessage(chatId, { text: '✅ Auto-Block on Spam is now *ENABLED* for Private Chats.\n\nNon-owner users who send 6 messages without a reply will be blocked.' }, { quoted: message });
    } else if (action === 'off') {
        await setAutoblock(false);
        await sock.sendMessage(chatId, { text: '✅ Auto-Block on Spam is now *DISABLED*.' }, { quoted: message });
    } else {
        const currentStatus = await getAutoblock();
        await sock.sendMessage(chatId, { 
            text: `🛡️ *Auto-Block Status:* ${currentStatus ? 'ENABLED' : 'DISABLED'}\n\nUsage:\n.autoblock on\n.autoblock off` 
        }, { quoted: message });
    }
}

module.exports = autoblockCommand;
