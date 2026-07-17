const axios = require('axios');

// Direct HTML-scraping fallback using mobile User-Agent
async function scrapePinterestDirect(query) {
    try {
        const response = await axios.get(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36'
            },
            timeout: 10000
        });
        const html = response.data;
        const matches = html.match(/https:\/\/i\.pinimg\.com\/(?:60x60|170x|236x|474x|736x)\/[0-9a-zA-Z\/_-]+\.jpg/g) || [];
        const uniqueUrls = [...new Set(matches.map(url => {
            return url.replace(/https:\/\/i\.pinimg\.com\/(?:60x60|170x|236x|474x)/, 'https://i.pinimg.com/736x');
        }))];
        return uniqueUrls;
    } catch (e) {
        console.error('Pinterest Direct Scraper Error:', e.message);
        return [];
    }
}

async function pinterestCommand(sock, chatId, text, message) {
    if (!text) {
        await sock.sendMessage(chatId, { 
            text: '❌ Please provide a search query.\n\nExample:\n`.pinterest aesthetic wallpapers`' 
        }, { quoted: message });
        return;
    }

    const query = text.trim();

    try {
        // Send loading reaction
        try {
            await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
        } catch (e) {}

        let imageUrls = [];

        // 1. Try Siputzx API (currently highly stable and free)
        try {
            const response = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`, { timeout: 10000 });
            if (response.data && response.data.status && Array.isArray(response.data.data)) {
                imageUrls = response.data.data.map(item => item.image_url).filter(Boolean);
            }
        } catch (e) {
            console.error('Pinterest: Siputzx API error:', e.message);
        }

        // 2. Try direct scraping fallback (completely independent of 3rd party APIs)
        if (imageUrls.length === 0) {
            console.log('Pinterest: Attempting direct scraping fallback...');
            imageUrls = await scrapePinterestDirect(query);
        }

        // 3. Try Lolhuman API if APIKey is present (secondary fallback)
        if (imageUrls.length === 0) {
            const lolhumanKey = global.APIKeys ? global.APIKeys['https://api.lolhuman.xyz'] : null;
            if (lolhumanKey) {
                try {
                    // Try the search endpoint first
                    const response = await axios.get(`https://api.lolhuman.xyz/api/pinterestsearch?apikey=${lolhumanKey}&query=${encodeURIComponent(query)}`, { timeout: 10000 });
                    if (response.data && response.data.status === 200 && Array.isArray(response.data.result)) {
                        imageUrls = response.data.result;
                    }
                } catch (e) {
                    console.error('Pinterest: Lolhuman API error:', e.message);
                }
            }
        }

        if (imageUrls.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No images found for your search query. Please try another keyword.' }, { quoted: message });
            return;
        }

        // Limit results to top 4 images to prevent spamming the chat
        const results = imageUrls.slice(0, 4);

        for (let i = 0; i < results.length; i++) {
            const imgUrl = results[i];
            try {
                await sock.sendMessage(chatId, {
                    image: { url: imgUrl },
                    caption: `📌 *Pinterest Result ${i + 1} for:* "${query}"`
                }, { quoted: message });
                
                // Small delay to prevent rate limits
                if (i < results.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            } catch (err) {
                console.error(`Error sending image ${i + 1}:`, err.message);
            }
        }

    } catch (error) {
        console.error('Error in pinterest command:', error);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while searching Pinterest.' }, { quoted: message });
    }
}

module.exports = pinterestCommand;
