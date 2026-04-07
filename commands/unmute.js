const isAdmin = require('../lib/isAdmin');
const { getGroupMetadata } = require('../lib/myfunc');

/**
 * .unmute command - Opens group to all members and tags everyone
 */
async function unmuteCommand(sock, chatId, senderId, message) {
    try {
        // Group only command
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command works only in groups' });
            return;
        }

        // Permission check
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'Please make the bot an admin first.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ Only group admins can use this command' }, { quoted: message });
            return;
        }

        // 1. Unmute group
        await sock.groupSettingUpdate(chatId, 'not_announcement');

        // 2. Get all participants
        const groupMetadata = await getGroupMetadata(sock, chatId);
        const participants = groupMetadata?.participants || [];

        // 3. Prepare tagging message
        let messageText = '🔓 *Group Unmuted Successfully!*\n\n📢 Group is now open for all members\n\n';
        
        // Add participants to message with mentions for tags
        participants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`;
        });

        // 4. Send the tagged confirmation message
        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: participants.map(p => p.id)
        }, { quoted: message });

    } catch (error) {
        console.error('Error in unmute command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to unmute and tag group. Contact owner.' });
    }
}

module.exports = unmuteCommand;
