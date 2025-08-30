const settings = require('../settings');

async function ownerCommand(sock, chatId) {
    // Handle owner number with + symbol - remove + for the vcard
    const ownerNumberClean = settings.ownerNumber.replace('+', '');
    
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${settings.botOwner}
TEL;waid=${ownerNumberClean}:${settings.ownerNumber}
END:VCARD
`;

    await sock.sendMessage(chatId, {
        contacts: { displayName: settings.botOwner, contacts: [{ vcard }] },
    });
}

module.exports = ownerCommand;
