const adminCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const { getGroupMetadata } = require('./myfunc');

async function isAdmin(sock, chatId, senderId) {
    if (!chatId || !chatId.endsWith('@g.us')) {
        return { isSenderAdmin: false, isBotAdmin: false };
    }
    try {
        const now = Date.now();
        let metadata;
        
        // Use cached metadata if available and valid
        if (adminCache.has(chatId) && (now - adminCache.get(chatId).timestamp < CACHE_TTL)) {
            metadata = adminCache.get(chatId).metadata;
        } else {
            metadata = await getGroupMetadata(sock, chatId);
            adminCache.set(chatId, { metadata, timestamp: now });
        }

        const participants = metadata.participants || [];

        // Extract bot's pure phone number
        const botId = sock.user?.id || '';
        const botLid = sock.user?.lid || '';
        const botNumber = botId.includes(':') ? botId.split(':')[0] : (botId.includes('@') ? botId.split('@')[0] : botId);
        const botIdWithoutSuffix = botId.includes('@') ? botId.split('@')[0] : botId;
        
        const botLidNumeric = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
        const botLidWithoutSuffix = botLid.includes('@') ? botLid.split('@')[0] : botLid;

        const senderNumber = senderId.includes(':') ? senderId.split(':')[0] : (senderId.includes('@') ? senderId.split('@')[0] : senderId);
        const senderIdWithoutSuffix = senderId.includes('@') ? senderId.split('@')[0] : senderId;

        // Check if bot is admin
        const isBotAdmin = participants.some(p => {
            const pPhoneNumber = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
            const pId = p.id ? p.id.split('@')[0] : '';
            const pLid = p.lid ? p.lid.split('@')[0] : '';
            const pFullId = p.id || '';
            const pFullLid = p.lid || '';
            
            const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : pLid;
            
            const botMatches = (
                botId === pFullId || 
                botId === pFullLid || 
                botLid === pFullLid || 
                botLidNumeric === pLidNumeric || 
                botLidWithoutSuffix === pLid || 
                botNumber === pPhoneNumber || 
                botNumber === pId || 
                botIdWithoutSuffix === pPhoneNumber || 
                botIdWithoutSuffix === pId || 
                (botLid && botLid.split('@')[0].split(':')[0] === pLid)
            );
            
            return botMatches && (p.admin === 'admin' || p.admin === 'superadmin');
        });

        // Check if sender is admin
        const isSenderAdmin = participants.some(p => {
            const pPhoneNumber = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
            const pId = p.id ? p.id.split('@')[0] : '';
            const pLid = p.lid ? p.lid.split('@')[0] : '';
            const pFullId = p.id || '';
            const pFullLid = p.lid || '';
            
            const senderMatches = (
                senderId === pFullId || 
                senderId === pFullLid || 
                senderNumber === pPhoneNumber || 
                senderNumber === pId || 
                senderIdWithoutSuffix === pPhoneNumber || 
                senderIdWithoutSuffix === pId || 
                (pLid && senderIdWithoutSuffix === pLid)
            );
            
            return senderMatches && (p.admin === 'admin' || p.admin === 'superadmin');
        });

        return { isSenderAdmin, isBotAdmin };
    } catch (err) {
        console.error('❌ Error in isAdmin:', err);
        return { isSenderAdmin: false, isBotAdmin: false };
    }
}

module.exports = isAdmin;
