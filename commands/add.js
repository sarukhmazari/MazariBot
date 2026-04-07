const isAdmin = require('../lib/isAdmin');

/**
 * Handles the .add command to add participants to a group.
 * @param {object} sock - The socket object.
 * @param {string} chatId - The JID of the group.
 * @param {string} senderId - The JID of the sender.
 * @param {Array} mentionedJids - List of mentioned JIDs.
 * @param {object} message - The original message object.
 */
async function addCommand(sock, chatId, senderId, mentionedJids, message) {
    // 1. Check if it's a group
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'This command can only be used in groups!' }, { quoted: message });
        return;
    }

    // 2. Privilege Check
    const isOwner = message.key.fromMe;
    if (!isOwner) {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'Please make the bot an admin first to use this command.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'Only group admins can use the .add command.' }, { quoted: message });
            return;
        }
    }

    // 3. Extract numbers from text
    const text = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text || 
                 '';
    const textArgs = text.split(/\s+/).slice(1);
    
    let usersToAdd = [];
    for (const arg of textArgs) {
        // Clean the number (remove +, spaces, -, etc.)
        let cleanNumber = arg.replace(/[^0-9]/g, '');
        
        // Basic validation for standard phone number length
        if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
            const jid = cleanNumber + '@s.whatsapp.net';
            if (!usersToAdd.includes(jid)) {
                usersToAdd.push(jid);
            }
        }
    }

    if (usersToAdd.length === 0) {
        await sock.sendMessage(chatId, { 
            text: '❌ Please provide a phone number to add!\n\n*Example:* `.add 923232391033`'
        }, { quoted: message });
        return;
    }

    try {
        // 4. Send "processing" indicator
        await sock.sendMessage(chatId, { text: `⏳ Trying to add ${usersToAdd.length} user(s)...` }, { quoted: message });

        // 5. Execute Baileys add command
        const response = await sock.groupParticipantsUpdate(chatId, usersToAdd, "add");
        
        // 6. Handle Response
        // Note: For multiple users, response is an array of objects [{jid: '...', status: '...'}]
        let feedback = [];
        
        for (const userJid of usersToAdd) {
            const userStatus = response.find(r => r.jid === userJid)?.status || 'unknown';
            const shortName = `@${userJid.split('@')[0]}`;
            
            switch (userStatus) {
                case '200':
                    feedback.push(`✅ ${shortName} added successfully!`);
                    break;
                case '403':
                    feedback.push(`⚠️ ${shortName} has privacy settings that require an invite link.`);
                    break;
                case '408':
                    feedback.push(`🚫 ${shortName} recently left the group and cannot be added back yet.`);
                    break;
                case '409':
                    feedback.push(`ℹ️ ${shortName} is already a member of this group.`);
                    break;
                case '500':
                    feedback.push(`❌ Failed to add ${shortName} (Group might be full).`);
                    break;
                default:
                    feedback.push(`❌ Failed to add ${shortName} (Status: ${userStatus})`);
            }
        }

        await sock.sendMessage(chatId, { 
            text: feedback.join('\n'),
            mentions: usersToAdd
        }, { quoted: message });

    } catch (error) {
        console.error('Error in add command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Critical error occurred while attempting to add participants.' 
        }, { quoted: message });
    }
}

module.exports = addCommand;
