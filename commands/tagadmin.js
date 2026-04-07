const isAdmin = require('../lib/isAdmin');
const { getGroupMetadata, getGroupAdmins } = require('../lib/myfunc');

/**
 * Command: .tagadmin
 * Purpose: Mentions all group admins.
 */
async function tagAdminCommand(sock, chatId, senderId, message, messageText) {
    try {
        // 1. Group Only Command Check
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { text: '❌ This command works only in groups' }, { quoted: message });
            return;
        }

        // 2. Fetch Admin Status
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        // 3. Permission Check (Restrict to admins)
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '❌ Only group admins can use this command' }, { quoted: message });
            return;
        }

        // 4. Fetch Group Metadata Dynamically
        const groupMetadata = await sock.groupMetadata(chatId); // Bypassing cache to ensure dynamic fetch
        const participants = groupMetadata.participants;
        
        // 5. Filter Admins
        const admins = getGroupAdmins(participants);

        if (!admins || admins.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No admins found in this group.' }, { quoted: message });
            return;
        }

        // 6. Handle Custom Message Support
        const customMessage = messageText ? messageText.trim() : '';
        let formattedText = customMessage ? `📢 ${customMessage}\n\n` : `📢 Attention Admins\n\n`;

        // 7. Tag All Admins
        admins.forEach(admin => {
            formattedText += `@${admin.split('@')[0]}\n`;
        });

        // 8. Send Message with Mentions
        await sock.sendMessage(chatId, {
            text: formattedText,
            mentions: admins
        }, { quoted: message });

    } catch (error) {
        console.error('Error in tagadmin command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to tag admins. Please try again.' }, { quoted: message });
    }
}

module.exports = tagAdminCommand;
