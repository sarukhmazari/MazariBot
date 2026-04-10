const { getMenuData } = require('../pluginHandler');

/**
 * Handle info commands like .menu, .help, and .ping
 */
async function infoHandler(client, chat, m, command, args) {
    const pushName = m.pushName || 'User';

    try {
        if (command === 'menu' || command === 'help') {
            const menuData = getMenuData();

            let menuText = `👋 Hello *${pushName}*!\n\n`;
            menuText += `🤖 *MAZARI BOT MENU*\n`;
            menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

            // Sort categories alphabetically
            const sortedData = [...menuData].sort((a, b) =>
                (a.category || '').localeCompare(b.category || '')
            );

            for (const categoryData of sortedData) {
                const category = categoryData.category || 'Uncategorized';
                const commands = categoryData.commands || [];

                if (commands.length === 0 || category === 'Hidden') continue;

                menuText += `*〔 ${category.toUpperCase()} 〕*\n`;
                menuText += commands.map(cmd => `• .${cmd}`).join('\n');
                menuText += '\n\n';
            }

            menuText += `━━━━━━━━━━━━━━━━━━━━\n`;
            menuText += `🤖 *MAZARI BOT*\n`;
            menuText += `💡 *Tip:* Use .help <command> for more info.\n`;
            menuText += `🚀 *GitHub:* github.com/sarukhmazari`;

            await client.sendMessage(chat, {
                text: menuText,
                contextInfo: {
                    externalAdReply: {
                        title: "MAZARI BOT",
                        body: "Professional WhatsApp Assistant",
                        mediaType: 1,
                        thumbnailUrl: "https://raw.githubusercontent.com/sarukhmazari/MazariBot/main/media/thumb.jpg",
                        sourceUrl: "https://github.com/sarukhmazari/MazariBot",
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

        } else if (command === 'ping') {
            const start = Date.now();
            await client.sendMessage(chat, { text: '⏳ *Pinging...*' }, { quoted: m });
            const end = Date.now();
            await client.sendMessage(chat, { text: `🏓 *Pong!*\n\n*Latency:* ${end - start}ms` }, { quoted: m });
        }
    } catch (error) {
        console.error('[Info Plugin Error]:', error);
        await client.sendMessage(chat, { text: '⚠️ An error occurred while processing the command.' }, { quoted: m });
    }
}

module.exports = {
    category: 'Info',
    commands: ['menu', 'help', 'ping'],
    handler: infoHandler
};