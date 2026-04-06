const { fetchJson } = require('../utils/fetchHelper');

/**
 * Handle anime commands like .anime, .waifu, and .neko
 */
async function animeHandler(client, chat, m, command, args) {
    let url = '';
    let caption = '';

    if (command === 'anime' || command === 'waifu') {
        url = 'https://api.waifu.pics/sfw/waifu';
        caption = `🌟 Here is a waifu for you!`;
    } else if (command === 'neko') {
        url = 'https://api.waifu.pics/sfw/neko';
        caption = `🐱 Meow! Here is a neko!`;
    } else {
        return;
    }

    try {
        const res = await fetchJson(url);
        if (!res || !res.url) throw new Error('Invalid API response');
        
        await client.sendMessage(chat, { 
            image: { url: res.url }, 
            caption: caption 
        }, { quoted: m });
    } catch (e) {
        console.error('[Anime Plugin Error]:', e);
        await client.sendMessage(chat, { text: '❌ Failed to fetch anime image. Please try again later.' }, { quoted: m });
    }
}

module.exports = {
    category: 'Anime',
    commands: ['anime', 'waifu', 'neko'],
    handler: animeHandler
};