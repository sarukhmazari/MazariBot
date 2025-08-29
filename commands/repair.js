const fs = require('fs');
const path = require('path');

async function repairCommand(sock, chatId, message) {
    try {
        // Check if sender is owner or sudo
        const { isSudo } = require('../lib/index');
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = message.key.fromMe;
        const isSudoUser = await isSudo(senderId);
        
        if (!isOwner && !isSudoUser) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is only available for the owner or sudo users!'
            });
            return;
        }

        // Clear the session folder
        const sessionPath = path.join(__dirname, '../session');
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('Session folder cleared');
        }

        await sock.sendMessage(chatId, {
            text: '🔄 Session cleared successfully!\n\n' +
                  '📱 To reconnect:\n' +
                  '1️⃣  Restart the bot\n' +
                  '2️⃣  Enter your phone number when prompted\n' +
                  '3️⃣  Use the pairing code to link WhatsApp\n\n' +
                  '⚠️  The bot will now disconnect. Please restart it.'
        });

        // Disconnect the bot after a short delay
        setTimeout(() => {
            process.exit(0);
        }, 2000);

    } catch (error) {
        console.error('Error in repair command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to clear session. Please try again.'
        });
    }
}

module.exports = repairCommand;
