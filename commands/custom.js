const { setCustomCommands, getCustomCommands, removeCustomCommands } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');

async function customCommand(sock, chatId, senderId, args, message) {
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups.' }, { quoted: message });
        return;
    }

    const adminStatus = await isAdmin(sock, chatId, senderId);
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    const isUserAdmin = adminStatus.isSenderAdmin || isOwner;

    if (!isUserAdmin) {
        await sock.sendMessage(chatId, { text: '❌ Only group admins or the bot owner can use this command.' }, { quoted: message });
        return;
    }

    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'set') {
        const commandList = args.slice(1).join(' ').split(',').map(cmd => cmd.trim().toLowerCase()).filter(cmd => cmd.length > 0);
        if (commandList.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ Please provide a list of commands separated by commas.\nExample: .custom set play,sticker,ai' }, { quoted: message });
            return;
        }

        await setCustomCommands(chatId, commandList);
        await sock.sendMessage(chatId, { text: `✅ Custom commands set! Members can now only use: *${commandList.join(', ')}*` }, { quoted: message });

    } else if (subCommand === 'off') {
        await removeCustomCommands(chatId);
        await sock.sendMessage(chatId, { text: '✅ Custom command restriction has been disabled for this group.' }, { quoted: message });

    } else if (subCommand === 'list') {
        const allowed = await getCustomCommands(chatId);
        if (!allowed) {
            await sock.sendMessage(chatId, { text: 'ℹ️ No custom command restrictions are set for this group.' }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: `📜 *Whitelisted Commands:*\n${allowed.map(cmd => `• ${cmd}`).join('\n')}` }, { quoted: message });
        }

    } else {
        await sock.sendMessage(chatId, { 
            text: '🛡️ *Custom Command Control*\n\nUsage:\n.custom set cmd1,cmd2,cmd3\n.custom off\n.custom list' 
        }, { quoted: message });
    }
}

module.exports = customCommand;
