const isAdmin = require('../lib/isAdmin');

async function kickCommand(sock, remoteJid, sender, mentionedJids, msg) {
    try {
        const isGroup = remoteJid.endsWith('@g.us');
        if (!isGroup) {
            return await sock.sendMessage(remoteJid, { text: '❌ This command can only be used in groups.' }, { quoted: msg });
        }

        // Check Admins
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, remoteJid, sender);
        
        if (!isBotAdmin) {
            return await sock.sendMessage(remoteJid, { text: '❌ Please make the bot an admin first.' }, { quoted: msg });
        }
        
        if (!isSenderAdmin && !msg.key.fromMe) {
            return await sock.sendMessage(remoteJid, { text: '❌ Only group admins can use the kick command.' }, { quoted: msg });
        }

        let usersToKick = [];

        // 1. From mentionedJids (passed from main handler)
        if (mentionedJids && mentionedJids.length > 0) {
            usersToKick = [...new Set(mentionedJids)];
        }

        // 2. From Reply
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (quotedMsg && !usersToKick.includes(quotedMsg)) {
            usersToKick.push(quotedMsg);
        }

        // 3. From Args (numbers in text)
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const words = text.split(/\s+/).slice(1);
        for (const word of words) {
            const num = word.replace(/[^0-9]/g, '');
            if (num.length >= 10) {
                const jid = num + '@s.whatsapp.net';
                if (!usersToKick.includes(jid)) {
                    usersToKick.push(jid);
                }
            }
        }

        // Remove duplicates and bot itself
        usersToKick = [...new Set(usersToKick)].filter(jid => jid !== (sock.user.id.split(':')[0] + '@s.whatsapp.net'));

        if (usersToKick.length === 0) {
            return await sock.sendMessage(remoteJid, { text: '❌ Please mention a user, reply to their message, or provide their number to kick!' }, { quoted: msg });
        }

        // Execution
        await sock.groupParticipantsUpdate(remoteJid, usersToKick, 'remove');
        
        // Success Message
        const mentions = usersToKick.map(jid => jid);
        const userTags = usersToKick.map(jid => '@' + jid.split('@')[0]).join(', ');
        await sock.sendMessage(remoteJid, { 
            text: `✅ Successfully kicked: ${userTags}`,
            mentions: mentions
        }, { quoted: msg });

    } catch (err) {
        console.error('❌ Error in kick command:', err);
        await sock.sendMessage(remoteJid, { text: `❌ Failed to kick user(s): ${err.message}` }, { quoted: msg });
    }
}

module.exports = kickCommand;