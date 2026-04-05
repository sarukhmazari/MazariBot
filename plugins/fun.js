const { fetchJson } = require('../utils/fetchHelper');

/**
 * Handle fun commands like .rate, .ship, .fact, and .quote
 */
async function funHandler(client, chat, m, command, args) {
    try {
        if (command === 'rate') {
            const user = m.mentionedJid?.[0] || chat;
            const rating = Math.floor(Math.random() * 101);
            let message = '';
            
            if (rating > 80) message = "😍 You are awesome!";
            else if (rating > 50) message = "💎 Decent enough!";
            else if (rating > 20) message = "💔 Just friends maybe?";
            else message = "💀 Better luck next time!";
            
            await client.sendMessage(chat, { 
                text: `✨ *RATING SYSTEM*\n\n👤 *User:* @${user.split('@')[0]}\n📊 *Rating:* ${rating}%\n\n${message}`,
                mentions: [user]
            }, { quoted: m });

        } else if (command === 'ship') {
            const users = m.mentionedJid || [];
            if (users.length < 2) return await client.sendMessage(chat, { text: '❌ Please mention two users to ship!' }, { quoted: m });
            
            const user1 = users[0];
            const user2 = users[1];
            const percent = Math.floor(Math.random() * 101);
            
            let message = '';
            if (percent > 80) message = "💖 Soulmates! Get married now!";
            else if (percent > 60) message = "❤️ A match made in heaven!";
            else if (percent > 40) message = "💓 Significant potential!";
            else message = "💀 Better as strangers.";
            
            await client.sendMessage(chat, { 
                text: `🚢 *SHIPPING:* @${user1.split('@')[0]} & @${user2.split('@')[0]}\n\n💞 *Match:* ${percent}%\n\n${message}`,
                mentions: [user1, user2]
            }, { quoted: m });

        } else if (command === 'fact') {
            const res = await fetchJson('https://nekos.life/api/v2/fact');
            if (res && res.fact) {
                await client.sendMessage(chat, { text: `🧐 *DID YOU KNOW?*\n\n${res.fact}` }, { quoted: m });
            }

        } else if (command === 'quote') {
            const res = await fetchJson('https://api.github.com/zen'); // Placeholder for a real quote API if needed, or nekos API
            const quoteRes = await fetchJson('https://animechan.xyz/api/random');
            if (quoteRes && quoteRes.quote) {
                await client.sendMessage(chat, { 
                    text: `💬 *ANIME QUOTE*\n\n"${quoteRes.quote}"\n\n- *${quoteRes.character}* (${quoteRes.anime})` 
                }, { quoted: m });
            }
        }
    } catch (error) {
        console.error('[Fun Plugin Error]:', error);
        await client.sendMessage(chat, { text: '⚠️ Failed to execute fun command.' }, { quoted: m });
    }
}

module.exports = {
    category: 'Fun',
    commands: ['rate', 'ship', 'fact', 'quote'],
    handler: funHandler
};