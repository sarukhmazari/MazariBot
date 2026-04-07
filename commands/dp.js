const { jidNormalizedUser } = require('@whiskeysockets/baileys');

async function dpCommand(sock, chatId, message) {
    try {
        let jid;

        // 1. Check if it's a reply
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;

        if (quotedParticipant) {
            jid = jidNormalizedUser(quotedParticipant);
        } 
        // 2. Check for mentions
        else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            jid = jidNormalizedUser(message.message.extendedTextMessage.contextInfo.mentionedJid[0]);
        }
        // 3. Fallback to sender
        else {
            jid = jidNormalizedUser(message.key.participant || message.key.remoteJid);
        }

        if (!jid) {
            return await sock.sendMessage(chatId, { text: '❌ Could not determine user JID.' }, { quoted: message });
        }

        try {
            const ppUrl = await sock.profilePictureUrl(jid, 'image');

            if (!ppUrl) {
                return await sock.sendMessage(chatId, { text: '❌ This user does not have a profile picture or their privacy settings prevent me from seeing it.' }, { quoted: message });
            }

            await sock.sendMessage(chatId, {
                image: { url: ppUrl },
                caption: `📸 Profile Picture of @${jid.split('@')[0]}`,
                contextInfo: {
                    ...(global.channelInfo?.contextInfo || {}),
                    mentionedJid: [jid]
                }
            }, { quoted: message });

        } catch (ppError) {
            console.error('Error fetching PP:', ppError);
            await sock.sendMessage(chatId, { text: '❌ Could not fetch profile picture. It might be private or the user has no DP.' }, { quoted: message });
        }

    } catch (error) {
        console.error('DP Command Error:', error);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while processing the command.' }, { quoted: message });
    }
}

module.exports = dpCommand;
