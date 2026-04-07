const settings = require('../settings');
const { isSudo } = require('./index');
const { getGroupMetadata } = require('./myfunc');

async function isOwnerOrSudo(senderId, sock = null, chatId = null) {
    if (!senderId) return false;

    // 0. Auto-allow bot account itself
    if (sock?.user?.id) {
        const botId = sock.user.id.split(':')[0];
        const selfId = senderId.split(':')[0];
        if (botId === selfId) return true;
    }
    
    const ownerNumbers = settings.ownerNumbers || [settings.ownerNumber];
    const senderIdClean = senderId.split(':')[0].split('@')[0];
    const senderLidNumeric = senderId.includes('@lid') ? senderId.split('@')[0].split(':')[0] : '';
    
    // 1. Direct match with owner list
    const isDirectOwner = ownerNumbers.some(num => {
        const cleanNum = num.replace(/[^0-9]/g, '');
        const ownerJid = cleanNum + "@s.whatsapp.net";
        return senderId === ownerJid || senderIdClean === cleanNum || senderId.includes(cleanNum);
    });

    if (isDirectOwner) return true;
    
    // 2. Sudo status check
    try {
        if (await isSudo(senderId)) return true;
    } catch (e) {
        // ignore
    }

    // 3. In groups, perform deep check (LID matching, etc.)
    if (sock && chatId && chatId.endsWith('@g.us')) {
        try {
            // Get bot's LID numeric
            const botLid = sock.user?.lid || '';
            const botLidNumeric = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
            
            // Check if sender's LID numeric matches bot's LID numeric (if bot is an owner)
            if (senderLidNumeric && botLidNumeric && senderLidNumeric === botLidNumeric) {
                return true;
            }
            
            // Search participants for a match against owner numbers
            const metadata = await getGroupMetadata(sock, chatId);
            const participants = metadata.participants || [];
            
            const isMatchInParticipants = participants.some(p => {
                const pId = p.id || '';
                const pIdClean = pId.split(':')[0].split('@')[0];
                const pLid = p.lid || '';
                const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : (pLid.includes('@') ? pLid.split('@')[0] : pLid);

                return ownerNumbers.some(num => {
                    const cleanNum = num.replace(/[^0-9]/g, '');
                    return pIdClean === cleanNum || pLidNumeric === botLidNumeric;
                });
            });

            if (isMatchInParticipants) return true;
        } catch (e) {
            // console.error('❌ [isOwner] Error checking participant data:', e);
        }
    }
    
    return false;
}

module.exports = isOwnerOrSudo;