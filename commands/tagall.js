const { getGroupMetadata } = require('../lib/myfunc');

async function tagAllCommand(sock, chatId, senderId, message) {
    console.log('Tagall command triggered by:', senderId, 'in chat:', chatId);
    try {
        // Get group metadata
        const groupMetadata = await getGroupMetadata(sock, chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            console.log('No participants found in group:', chatId);
            await sock.sendMessage(chatId, { text: 'No participants found in the group.' });
            return;
        }

        console.log(`Fetched ${participants.length} participants for tagall in group:`, chatId);

        // Create message with each member on a new line
        let messageText = '📢 Tagging everyone:\n\n';
        participants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`; // Add \n for new line
        });

        // Try to send message with mentions
        try {
            await sock.sendMessage(chatId, {
                text: messageText,
                mentions: participants.map(p => p.id)
            });
            console.log('Tagall message sent successfully with mentions');
        } catch (mentionError) {
            console.warn('Failed to send tagall with mentions, trying without:', mentionError);
            // Fallback: send message without mentions if mentioning fails
            let fallbackText = '📢 Tagging everyone:\n\n';
            participants.forEach(participant => {
                fallbackText += `${participant.id.split('@')[0]}\n`;
            });
            await sock.sendMessage(chatId, { text: fallbackText });
            console.log('Tagall fallback message sent without mentions');
        }

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to tag all members. Please try again later.' });
    }
}

module.exports = tagAllCommand;  // Export directly
