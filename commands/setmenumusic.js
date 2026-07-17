const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function setmenumusicCommand(sock, chatId, message) {
    try {
        // Find the audio message (either quoted or direct)
        let audioMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
        if (!audioMessage) {
            audioMessage = message.message?.audioMessage;
        }

        if (!audioMessage) {
            await sock.sendMessage(chatId, { text: '❌ Please reply to an audio file/voice note or send one with the caption *.setmenumusic* (or *.setmusic*) to change the menu background music.' }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: '⏳ Downloading and saving the new menu background music...' }, { quoted: message });

        // Download the audio content
        const stream = await downloadContentFromMessage(audioMessage, 'audio');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Save it to assets/musics/MUSIC.mp3
        const dirPath = path.join(process.cwd(), 'assets/musics');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const filePath = path.join(dirPath, 'MUSIC.mp3');
        fs.writeFileSync(filePath, buffer);

        await sock.sendMessage(chatId, { text: '✅ Custom menu background music set successfully! It will now play when you call the menu.' }, { quoted: message });

    } catch (error) {
        console.error('Error setting custom menu music:', error);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while setting the menu music.' }, { quoted: message });
    }
}

module.exports = setmenumusicCommand;
