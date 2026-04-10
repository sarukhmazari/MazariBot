const isAdmin = require('../lib/isAdmin');
const settings = require('../settings');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// Function to handle manual promotions via command
async function promoteCommand(sock, chatId, mentionedJids, message) {
    let userToPromote = [];
    
    // Check for mentioned users
    if (mentionedJids && mentionedJids.length > 0) {
        userToPromote = mentionedJids;
    }
    // Check for replied message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToPromote = [message.message.extendedTextMessage.contextInfo.participant];
    }
    
    // If no user found through either method
    if (userToPromote.length === 0) {
        await sock.sendMessage(chatId, { 
            text: 'Please mention the user or reply to their message to promote!'
        });
        return;
    }

    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const groupMetadata = await sock.groupMetadata(chatId);
        const groupCreator = jidNormalizedUser(groupMetadata.owner || groupMetadata.subjectOwner || "");
        
        // Robust Numeric Matching
        const cleanJid = (jid) => {
            if (!jid) return "";
            const raw = typeof jid === 'string' ? jid : (jid.id || jid.toString() || "");
            return raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        };

        const ownerClean = settings.ownerNumber.replace(/[^0-9]/g, '');
        const multipleOwnersClean = (settings.ownerNumbers || []).map(num => num.replace(/[^0-9]/g, ''));
        const botClean = cleanJid(sock.user.id);
        const creatorClean = cleanJid(groupCreator);
        const senderClean = cleanJid(senderId);

        const isOwner = senderClean === ownerClean || 
                        senderClean === botClean || 
                        senderClean === creatorClean ||
                        multipleOwnersClean.includes(senderClean);

        // Standard admin check
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        // If NOT owner and NOT admin, block
        if (!isOwner && !isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '❌ *Permission Denied:* Only group admins or the bot owner can use this command.' }, { quoted: message });
            return;
        }

        // Attempt promotion regardless of isBotAdmin status (User doesn't want the restriction message)
        try {
            await sock.groupParticipantsUpdate(chatId, userToPromote, "promote");
            
            // Success response
            const usernames = await Promise.all(userToPromote.map(async jid => `@${jid.split('@')[0]}`));
            const promoterJid = jidNormalizedUser(sock.user.id);
            
            const promotionMessage = `*『 GROUP PROMOTION 』*\n\n` +
                `👥 *Promoted User${userToPromote.length > 1 ? 's' : ''}:*\n` +
                `${usernames.map(name => `• ${name}`).join('\n')}\n\n` +
                `👑 *Promoted By:* @${promoterJid.split('@')[0]}\n\n` +
                `📅 *Date:* ${new Date().toLocaleString()}`;
            
            await sock.sendMessage(chatId, { 
                text: promotionMessage,
                mentions: [...userToPromote, promoterJid]
            });
        } catch (promoteError) {
            // Detailed error handling for protocol failures
            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: '❌ *Action Failed:* The promotion failed. This usually happens because the bot is not an admin in this group. Please make the bot an admin and try again.' }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: '❌ *Action Failed:* Could not promote the user. This might be due to group security settings.' }, { quoted: message });
            }
        }

    } catch (err) {
        console.error('Error in promote command logic:', err);
    }
}

// Function to handle automatic promotion detection
async function handlePromotionEvent(sock, groupId, participants, author) {
    try {
        if (!Array.isArray(participants) || participants.length === 0) return;

        const promotedUsernames = await Promise.all(participants.map(async jid => {
            const jidString = typeof jid === 'string' ? jid : (jid.id || jid.toString());
            return `@${jidString.split('@')[0]} `;
        }));

        let promotedBy = 'System';
        let mentionList = participants.map(jid => typeof jid === 'string' ? jid : (jid.id || jid.toString()));

        if (author) {
            const authorJid = typeof author === 'string' ? author : (author.id || author.toString());
            promotedBy = `@${authorJid.split('@')[0]}`;
            mentionList.push(authorJid);
        }

        const promotionMessage = `*『 GROUP PROMOTION 』*\n\n` +
            `👥 *Promoted User${participants.length > 1 ? 's' : ''}:*\n` +
            `${promotedUsernames.map(name => `• ${name}`).join('\n')}\n\n` +
            `👑 *Promoted By:* ${promotedBy}\n\n` +
            `📅 *Date:* ${new Date().toLocaleString()}`;
        
        await sock.sendMessage(groupId, {
            text: promotionMessage,
            mentions: mentionList
        });
    } catch (error) {
        console.error('Error handling promotion event:', error);
    }
}

module.exports = { promoteCommand, handlePromotionEvent };
