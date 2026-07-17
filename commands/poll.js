async function pollCommand(sock, chatId, text, message) {
    if (!text) {
        await sock.sendMessage(chatId, { 
            text: '❓ *How to use poll:*\n\n`.poll Question | Option 1 | Option 2 | Option 3`' 
        }, { quoted: message });
        return;
    }

    const parts = text.split('|').map(p => p.trim());
    const question = parts[0];
    const options = parts.slice(1);

    if (options.length < 2) {
        await sock.sendMessage(chatId, { 
            text: '❌ You must provide a question and at least 2 options.\n\nExample:\n`.poll What is your choice? | Option A | Option B`' 
        }, { quoted: message });
        return;
    }

    try {
        await sock.sendMessage(chatId, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1 // Single-choice native poll
            }
        });
    } catch (error) {
        console.error('Error sending poll:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to create poll. Make sure you are in a group.' }, { quoted: message });
    }
}

module.exports = pollCommand;
