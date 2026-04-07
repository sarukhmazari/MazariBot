const { setPrivateCustomCommands, getPrivateCustomCommands, removePrivateCustomCommands } = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');

async function pcustomeCommand(sock, chatId, senderId, args, message) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
        return;
    }

    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    if (!isOwner) {
        await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner or sudo!' }, { quoted: message });
        return;
    }

    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'set') {
        const text = args.slice(1).join(' ');
        if (!text) {
            await sock.sendMessage(chatId, { text: '❌ Please provide a list of commands separated by commas.\nExample: .pcustome set play,ytmp3,menu' }, { quoted: message });
            return;
        }
        const commandList = text.split(',').map(cmd => cmd.trim().toLowerCase()).filter(cmd => cmd.length > 0);
        if (commandList.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ Invalid command list.' }, { quoted: message });
            return;
        }

        await setPrivateCustomCommands(chatId, commandList);
        await sock.sendMessage(chatId, { text: `✅ Custom commands enabled for this group: ${commandList.join(', ')}` }, { quoted: message });

    } else if (subCommand === 'get') {
        const allowed = await getPrivateCustomCommands(chatId);
        if (!allowed || allowed.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No custom commands are set for this group.' }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: `📜 Allowed commands in this group: ${allowed.join(', ')}` }, { quoted: message });
        }

    } else if (subCommand === 'off') {
        await removePrivateCustomCommands(chatId);
        await sock.sendMessage(chatId, { text: '❌ Custom command access disabled for this group.' }, { quoted: message });

    } else {
        await sock.sendMessage(chatId, { 
            text: '🛡️ *Private Mode Custom Control*\n\nUsage:\n.pcustome set cmd1,cmd2,cmd3\n.pcustome get\n.pcustome off' 
        }, { quoted: message });
    }
}

module.exports = pcustomeCommand;
