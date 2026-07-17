const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function setmenudpCommand(sock, chatId, message) {
    try {
        // Find the image message (either quoted or direct)
        let imageMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        if (!imageMessage) {
            imageMessage = message.message?.imageMessage;
        }

        if (!imageMessage) {
            await sock.sendMessage(chatId, { text: '❌ Please reply to an image or send an image with the caption *.setmenudp* (or *.setdp*) to change the menu picture.' }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: '⏳ Downloading and saving the new menu picture...' }, { quoted: message });

        // Download the image content
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Save it to assets/images/custom_menu.jpg
        const dirPath = path.join(process.cwd(), 'assets/images');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const filePath = path.join(dirPath, 'custom_menu.jpg');
        fs.writeFileSync(filePath, buffer);

        await sock.sendMessage(chatId, { text: '✅ Custom menu picture set successfully! It will now be used when you call the menu.' }, { quoted: message });

    } catch (error) {
        console.error('Error setting custom menu DP:', error);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while setting the menu picture.' }, { quoted: message });
    }
}

async function resetmenudpCommand(sock, chatId, message) {
    try {
        const filePath = path.join(process.cwd(), 'assets/images/custom_menu.jpg');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            await sock.sendMessage(chatId, { text: '✅ Custom menu picture removed! The default hosted image will now be used.' }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: 'ℹ️ The menu is already using the default hosted image.' }, { quoted: message });
        }
    } catch (error) {
        console.error('Error resetting menu DP:', error);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while resetting the menu picture.' }, { quoted: message });
    }
}

module.exports = {
    setmenudpCommand,
    resetmenudpCommand
};
