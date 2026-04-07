const settings = require('../settings');

async function ownerCommand(sock, chatId) {
    const owner1 = '923232391033';
    const owner2 = '224627425825';
    
    const vcard1 = `
BEGIN:VCARD
VERSION:3.0
FN:〔 𝗠𝗔𝗭𝗔𝗥𝗜 𝗧𝗘𝗔𝗠 〕
TEL;waid=${owner1}:${owner1}
END:VCARD`.trim();

    const vcard2 = `
BEGIN:VCARD
VERSION:3.0
FN:〔 𝗠𝗔𝗭𝗔𝗥𝗜 𝗧𝗘𝗔𝗠 𝟸 〕
TEL;waid=${owner2}:${owner2}
END:VCARD`.trim();

    await sock.sendMessage(chatId, {
        contacts: { 
            displayName: "〔 𝗠𝗔𝗭𝗔𝗥𝗜 𝗧𝗘𝗔𝗠 〕", 
            contacts: [
                { vcard: vcard1 },
                { vcard: vcard2 }
            ] 
        },
        contextInfo: global.promotionInfo?.contextInfo
    });
}

module.exports = ownerCommand;
