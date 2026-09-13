const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

async function downloadMediaMessage(message, mediaType) {
    const stream = await downloadContentFromMessage(message, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    const customTemp = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
    const filePath = path.join(customTemp, `${Date.now()}_${Math.random().toString(36).substring(7)}.${mediaType}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// Utility function to shuffle an array (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Utility function for delay in ms
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * .send / .sendlink / .send link command
 * Group command: Sends the text, link, or replied media personally to up to 50 group members in DM.
 * Includes anti-spam randomized delay between individual messages to prevent account bans.
 */
async function sendLinkCommand(sock, chatId, senderId, messageText, replyMessage, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: '❌ This command can only be used in group chats!' }, { quoted: message });
        return;
    }

    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const botNum = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
        
        const participants = (groupMetadata.participants || []).filter(p => {
            const memberNum = p.id.split(':')[0].split('@')[0];
            return !botNum || memberNum !== botNum;
        });

        if (participants.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ Failed to fetch group members.' }, { quoted: message });
            return;
        }

        let tempFilePath = null;
        let contentTemplate = null;

        if (replyMessage) {
            if (replyMessage.imageMessage) {
                tempFilePath = await downloadMediaMessage(replyMessage.imageMessage, 'image');
                contentTemplate = { image: { url: tempFilePath }, caption: messageText || replyMessage.imageMessage.caption || '' };
            } else if (replyMessage.videoMessage) {
                tempFilePath = await downloadMediaMessage(replyMessage.videoMessage, 'video');
                contentTemplate = { video: { url: tempFilePath }, caption: messageText || replyMessage.videoMessage.caption || '' };
            } else if (replyMessage.conversation || replyMessage.extendedTextMessage) {
                const textContent = messageText ? `${messageText}\n\n${replyMessage.conversation || replyMessage.extendedTextMessage.text}` : (replyMessage.conversation || replyMessage.extendedTextMessage.text);
                contentTemplate = { text: textContent };
            } else if (replyMessage.documentMessage) {
                tempFilePath = await downloadMediaMessage(replyMessage.documentMessage, 'document');
                contentTemplate = { document: { url: tempFilePath }, fileName: replyMessage.documentMessage.fileName, caption: messageText || '' };
            }
        }

        if (!contentTemplate || Object.keys(contentTemplate).length === 0) {
            if (!messageText) {
                await sock.sendMessage(chatId, { text: '⚠️ Please provide a link/text or reply to a message to send!\n\n*Usage:* `.send https://chat.whatsapp.com/...`' }, { quoted: message });
                return;
            }
            contentTemplate = { text: messageText };
        }

        // Shuffle participants and select up to 10 members
        const shuffled = shuffleArray(participants);
        const selectedMembers = shuffled.slice(0, Math.min(10, shuffled.length));

        await sock.sendMessage(chatId, { text: `🚀 *Starting private mass send...*\nSending message to ${selectedMembers.length} group members personally in DM (with anti-ban delay).` }, { quoted: message });

        let successCount = 0;
        let failCount = 0;

        for (const member of selectedMembers) {
            const recipientJid = member.id;
            console.log(`📡 [SEND-DM] Sending DM to ${recipientJid}...`);
            try {
                await sock.sendMessage(recipientJid, contentTemplate);
                console.log(`✅ [SEND-DM] Successfully sent DM to ${recipientJid}`);
                successCount++;
            } catch (err) {
                console.error(`❌ [SEND-DM] Failed to send DM to ${recipientJid}:`, err.message);
                failCount++;
            }

            // Anti-spam randomized delay: 2.5s to 4.5s between each personal message
            const delay = Math.floor(Math.random() * 2000) + 2500;
            await sleep(delay);
        }

        // Clean up temp file if created
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }

        await sock.sendMessage(chatId, { text: `✅ *Mass private send completed!*\n\n📩 Successful DMs: *${successCount}*\n❌ Failed DMs: *${failCount}*` }, { quoted: message });

    } catch (error) {
        console.error('Error in sendLinkCommand:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to execute send command. Make sure group metadata is accessible.' }, { quoted: message });
    }
}

module.exports = sendLinkCommand;
