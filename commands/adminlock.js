const { setAdminlock, getAdminlock } = require('../lib/index');
const settings = require('../settings');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

async function adminlockCommand(sock, chatId, senderId, args, message) {
    try {
        const ownerNumberFormatted = `${settings.ownerNumber}@s.whatsapp.net`;
        const senderJid = jidNormalizedUser(senderId);
        
        if (senderJid !== ownerNumberFormatted && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used by the Bot Owner.' }, { quoted: message });
            return;
        }

        const action = args[0]?.toLowerCase();

        if (action === 'on') {
            await setAdminlock(chatId, true);
            await sock.sendMessage(chatId, { text: '🔒 *Admin Lock is now ON.*\n\nOnly the owner can assign admins. Unauthorized promotions will be reversed immediately, and all unauthorized admins will be demoted.' }, { quoted: message });
        } else if (action === 'off') {
            await setAdminlock(chatId, false);
            await sock.sendMessage(chatId, { text: '🔓 *Admin Lock is now OFF.*\n\nGroup admins can now freely promote other members.' }, { quoted: message });
        } else {
            const status = await getAdminlock(chatId);
            await sock.sendMessage(chatId, { text: `🛡️ *Admin Lock Status:* ${status ? 'ON' : 'OFF'}\n\nUse *.adminlock on* or *.adminlock off*` }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in adminlock command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to process adminlock command.' }, { quoted: message });
    }
}

async function handleAdminlockPromotion(sock, groupId, participants, author) {
    try {
        const isEnabled = await getAdminlock(groupId);
        if (!isEnabled) return;

        const ownerNumberFormatted = jidNormalizedUser(`${settings.ownerNumber}@s.whatsapp.net`);
        const botJid = jidNormalizedUser(sock.user.id);
        
        const authorJid = author ? jidNormalizedUser(typeof author === 'string' ? author : (author.id || author.toString())) : null;
        
        // If the author is null, it's safer to ignore it for now as it might be a system action
        if (!authorJid) return;

        // Fetch group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        const groupCreator = jidNormalizedUser(groupMetadata.owner || groupMetadata.subjectOwner || "");

        // Check if the author is a sudo user
        const { isSudo, getSudoList } = require('../lib/index');
        const authorIsSudo = await isSudo(authorJid);
        
        // Check if the author is in owner.json
        const fs = require('fs');
        let ownersList = [];
        try {
            if (fs.existsSync('./data/owner.json')) {
                const ownerData = JSON.parse(fs.readFileSync('./data/owner.json', 'utf8'));
                if (Array.isArray(ownerData)) {
                    ownersList = ownerData.map(num => jidNormalizedUser(num.includes('@') ? num : `${num}@s.whatsapp.net`));
                }
            }
        } catch (e) {}

        const isAuthorizedAuthor = authorJid === ownerNumberFormatted || 
                                   authorJid === botJid || 
                                   authorJid === groupCreator ||
                                   authorIsSudo || 
                                   ownersList.includes(authorJid);
        
        if (isAuthorizedAuthor) {
            return; // Authorized promotion, ignore
        }

        // Find all admins and normalize their JIDs
        const admins = groupMetadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => jidNormalizedUser(p.id));
            
        // Admins to demote: newly promoted + all other admins EXCEPT authorized ones
        let toDemote = new Set([
            ...participants.map(p => jidNormalizedUser(typeof p === 'string' ? p : (p.id || p.toString()))),
            ...admins
        ]);
        
        // Ensure we NEVER demote authorized users
        toDemote.delete(ownerNumberFormatted);
        toDemote.delete(botJid);
        if (groupCreator) toDemote.delete(groupCreator);
        ownersList.forEach(owner => toDemote.delete(owner));
        
        try {
            const sudoList = await getSudoList();
            if (Array.isArray(sudoList)) {
                sudoList.forEach(sudo => {
                    const normalizedSudo = jidNormalizedUser(sudo.id || sudo);
                    toDemote.delete(normalizedSudo);
                });
            }
        } catch (e) {}
        
        const demoteList = Array.from(toDemote);

        if (demoteList.length > 0) {
            // Immediate demotion to prevent infinite loops
            await sock.groupParticipantsUpdate(groupId, demoteList, 'demote');
            
            // Send warning message
            await sock.sendMessage(groupId, { 
                text: `🚨 *UNAUTHORIZED PROMOTION DETECTED*\n\nAdmin Lock is enabled! Only the owner can promote.\n\nDemoted users:\n${demoteList.map(jid => `• @${jid.split('@')[0]}`).join('\n')}`,
                mentions: demoteList
            });
        }
    } catch (error) {
        console.error('Error in handleAdminlockPromotion:', error);
    }
}

module.exports = { adminlockCommand, handleAdminlockPromotion };
