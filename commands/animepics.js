const axios = require('axios');
const fs = require('fs');

// Local fallback quotes in case the external API is offline
const LOCAL_QUOTES = [
    {
        quote: "If you don't like your destiny, don't accept it. Instead have the courage to change it the way you want it to be!",
        character: "Naruto Uzumaki",
        anime: "Naruto"
    },
    {
        quote: "Fear is not evil. It tells you what your weakness is. And once you know your weakness, you can become stronger as well as kinder.",
        character: "Gildarts Clive",
        anime: "Fairy Tail"
    },
    {
        quote: "Whatever you lose, you'll find it again. But what you throw away you'll never get back.",
        character: "Kenshin Himura",
        anime: "Rurouni Kenshin"
    },
    {
        quote: "It's not the face that makes someone a monster, it's the choices they make with their lives.",
        character: "Naruto Uzumaki",
        anime: "Naruto"
    },
    {
        quote: "If you want to make people dream, you've gotta start by believing in that dream yourself!",
        character: "Seiya Kanie",
        anime: "Amagi Brilliant Park"
    },
    {
        quote: "Power comes in response to a need, not a desire. You have to create that need.",
        character: "Goku",
        anime: "Dragon Ball Z"
    },
    {
        quote: "Even if things are painful and tough, people should appreciate what it means to be alive at all.",
        character: "Yato",
        anime: "Noragami"
    },
    {
        quote: "You should enjoy the little detours to the utmost. Because that's where you'll find the things more important than what you want.",
        character: "Ging Freecss",
        anime: "Hunter x Hunter"
    }
];

async function animePicsCommand(sock, chatId, message, type) {
    try {
        // Send a loading reaction
        await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

        let imageUrl = '';
        let resolvedFrom = '';

        // Helper function for API requests with timeout
        const fetchAPI = async (url) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout
            try {
                const response = await axios.get(url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                clearTimeout(timeoutId);
                return response.data;
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        };

        // 1. Try Primary Endpoints
        try {
            if (['waifu', 'neko', 'shinobu', 'megumin'].includes(type)) {
                const data = await fetchAPI(`https://api.waifu.pics/sfw/${type}`);
                imageUrl = data.url;
                resolvedFrom = 'waifu.pics';
            } else if (['maid', 'uniform'].includes(type)) {
                const data = await fetchAPI(`https://api.waifu.im/search?included_tags=${type}`);
                imageUrl = data.images?.[0]?.url;
                resolvedFrom = 'waifu.im';
            } else if (['husbando', 'kitsune'].includes(type)) {
                const data = await fetchAPI(`https://nekos.best/api/v2/${type}`);
                imageUrl = data.results?.[0]?.url;
                resolvedFrom = 'nekos.best';
            }
        } catch (error) {
            console.warn(`[AnimePics API Error] Primary API for ${type} failed: ${error.message}`);
        }

        // 2. Try Fallback Endpoints if Primary failed
        if (!imageUrl) {
            try {
                if (['waifu', 'neko'].includes(type)) {
                    // Fallback to nekos.best
                    const data = await fetchAPI(`https://nekos.best/api/v2/${type}`);
                    imageUrl = data.results?.[0]?.url;
                    resolvedFrom = 'nekos.best (fallback)';
                } else if (['maid', 'uniform'].includes(type)) {
                    // Fallback to waifu.pics waifu category
                    const data = await fetchAPI(`https://api.waifu.pics/sfw/waifu`);
                    imageUrl = data.url;
                    resolvedFrom = 'waifu.pics (fallback)';
                } else if (['husbando', 'kitsune', 'shinobu', 'megumin'].includes(type)) {
                    // Fallback to waifu.pics waifu category
                    const data = await fetchAPI(`https://api.waifu.pics/sfw/waifu`);
                    imageUrl = data.url;
                    resolvedFrom = 'waifu.pics (fallback)';
                }
            } catch (error) {
                console.warn(`[AnimePics API Error] Fallback APIs for ${type} also failed: ${error.message}`);
            }
        }

        // 3. Send image if successfully fetched
        if (imageUrl) {
            await sock.sendMessage(chatId, {
                image: { url: imageUrl },
                caption: `✨ *Here is your ${type.charAt(0).toUpperCase() + type.slice(1)}!* 🌸\n📡 *Source:* ${resolvedFrom}\n\n© ZOXER BOT`
            }, { quoted: message });

            await sock.sendMessage(chatId, { react: { text: '💖', key: message.key } });
            return;
        }

        // 4. Offline mode fallback if all APIs are unreachable
        console.warn(`[AnimePics API] Network/API unreachable. Sending local image fallback.`);
        const localCandidates = [
            './assets/images/logo.png',
            './assets/images/DP.jpg',
            './assets/images/DP.png'
        ];

        const localPath = localCandidates.find(p => fs.existsSync(p));
        if (localPath) {
            const buffer = fs.readFileSync(localPath);
            await sock.sendMessage(chatId, {
                image: buffer,
                caption: `⚠️ *[Offline Mode]* Could not connect to the anime servers. Displaying default graphic.\n\n© ZOXER BOT`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '⚠️', key: message.key } });
        } else {
            await sock.sendMessage(chatId, {
                text: `❌ Could not fetch anime image for *.${type}*. Network servers are currently unreachable.`
            }, { quoted: message });
        }

    } catch (error) {
        console.error(`Error in animePicsCommand (${type}):`, error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to fetch anime image for *.${type}*. Please try again later.`
        }, { quoted: message });
    }
}

async function animeQuoteCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { react: { text: '📜', key: message.key } });

        let quoteData = null;

        // Fetch from animechan.xyz API
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await axios.get('https://animechan.xyz/api/random', {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            clearTimeout(timeoutId);
            if (res.data && res.data.quote) {
                quoteData = {
                    quote: res.data.quote,
                    character: res.data.character,
                    anime: res.data.anime
                };
            }
        } catch (apiError) {
            console.warn('[AnimeQuote API Error] AnimeChan API failed/offline. Falling back to local dataset.');
        }

        // Fallback to offline quotes
        if (!quoteData) {
            quoteData = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
        }

        const formattedQuote = `💬 *Anime Quote*\n\n"${quoteData.quote}"\n\n👤 *Character:* ${quoteData.character}\n📺 *Anime:* ${quoteData.anime}`;

        await sock.sendMessage(chatId, { text: formattedQuote }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('Error in animeQuoteCommand:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to fetch anime quote. Please try again later.'
        }, { quoted: message });
    }
}

module.exports = {
    animePicsCommand,
    animeQuoteCommand
};
