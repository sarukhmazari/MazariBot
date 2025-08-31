const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');

async function ttsCommand(sock, chatId, text, message, language = 'en') {
    if (!text) {
        await sock.sendMessage(chatId, { text: 'Please provide the text for TTS conversion.' });
        return;
    }

    const fileName = `tts-${Date.now()}.mp3`;
    // Use /tmp/ for Railway and cloud compatibility
    const filePath = path.join('/tmp', fileName);

    const gtts = new gTTS(text, language);
    gtts.save(filePath, async function (err) {
        if (err) {
            await sock.sendMessage(chatId, { text: 'Error generating TTS audio.' });
            return;
        }

        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg'
        }, { quoted: message });

        fs.unlinkSync(filePath);
    });
}

module.exports = ttsCommand;
