const { fetchJson } = require('../utils/fetchHelper');

const reactions = [
    'slap', 'hug', 'kiss', 'bully', 'lick', 'pat', 'bite', 'yeet', 'bonk', 'smile', 'wave', 'blush', 'wink', 
    'poke', 'dance', 'cuddle', 'glomp', 'happy', 'kill', 'cringe', 'highfive', 'smug', 'nom', 'awoo', 'bite', 'handhold'
];

/**
 * Handle reaction commands like .slap, .hug, etc.
 */
async function reactionHandler(client, chat, m, command, args) {
    if (!reactions.includes(command)) return;

    try {
        const url = `https://api.waifu.pics/sfw/${command}`;
        const res = await fetchJson(url);
        
        if (!res || !res.url) throw new Error('Invalid API response');

        const mention = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : '');
        const sender = m.pushName || 'Someone';
        
        let caption = '';
        if (mention) {
            caption = `🎭 *${sender}* ${command}ed @${mention.split('@')[0]}!`;
        } else {
            caption = `🎭 *${sender}* is feeling ${command}!`;
        }

        await client.sendMessage(chat, { 
            video: { url: res.url }, 
            caption: caption,
            gifPlayback: true,
            mentions: mention ? [mention] : []
        }, { quoted: m });

    } catch (error) {
        console.error('[Reaction Plugin Error]:', error);
        // Fallback to image if video fails or just send error
        await client.sendMessage(chat, { text: `⚠️ Failed to fetch ${command} reaction.` }, { quoted: m });
    }
}

module.exports = {
    category: 'Reactions',
    commands: reactions,
    handler: reactionHandler
};