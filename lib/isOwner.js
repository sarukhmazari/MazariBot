const { isSudo } = require('./index');
const settings = require('../settings');

async function isOwnerOrSudo(senderId) {
    // Handle owner number with + symbol - remove + and add @s.whatsapp.net
    const ownerNumberClean = settings.ownerNumber.replace('+', '');
    const ownerJid = ownerNumberClean + "@s.whatsapp.net";
    
    if (senderId === ownerJid) return true;
    return await isSudo(senderId);
}

module.exports = isOwnerOrSudo;