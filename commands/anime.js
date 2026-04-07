const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');
const crypto = require('crypto');

// Multiple API endpoints for fallback
const API_ENDPOINTS = {
    primary: 'https://api.some-random-api.com/animu',
    fallback1: 'https://api.waifu.pics/sfw',
    fallback2: 'https://nekos.life/api/v2/img'
};

function normalizeType(input) {
    const lower = (input || '').toLowerCase();
    if (lower === 'facepalm' || lower === 'face_palm') return 'face-palm';
    if (lower === 'quote' || lower === 'animu-quote' || lower === 'animuquote') return 'quote';
    return lower;
}

async function sendAnimu(sock, chatId, message, type) {
    let imageUrl = null;

    // Try primary API first
    try {
        const endpoint = `${API_ENDPOINTS.primary}/${type}`;
        const res = await axios.get(endpoint, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (res.data && res.data.link) {
            imageUrl = res.data.link;
        }
    } catch (error) {
        console.log(`Primary API failed for ${type}, trying fallback...`);

        // Try fallback API 1 (waifu.pics)
        try {
            const typeMap = {
                'hug': 'hug',
                'kiss': 'kiss',
                'pat': 'pat',
                'poke': 'poke',
                'wink': 'wink',
                'nom': 'nom',
                'cry': 'cry'
            };

            if (typeMap[type]) {
                const res = await axios.get(`${API_ENDPOINTS.fallback1}/${typeMap[type]}`, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (res.data && res.data.url) {
                    imageUrl = res.data.url;
                }
            }
        } catch (err2) {
            console.log(`Fallback API 1 failed, trying fallback 2...`);

            // Try fallback API 2 (nekos.life)
            try {
                const typeMap2 = {
                    'hug': 'hug',
                    'kiss': 'kiss',
                    'pat': 'pat',
                    'poke': 'poke',
                    'wink': 'wink'
                };

                if (typeMap2[type]) {
                    const res = await axios.get(`${API_ENDPOINTS.fallback2}/${typeMap2[type]}`, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (res.data && res.data.url) {
                        imageUrl = res.data.url;
                    }
                }
            } catch (err3) {
                console.log(`All APIs failed for ${type}`);
            }
        }
    }

    if (!imageUrl) {
        await sock.sendMessage(
            chatId,
            { text: `❌ Sorry, anime ${type} is temporarily unavailable. Please try again later.` },
            { quoted: message }
        );
        return;
    }

    // Send the image
    try {
        await sock.sendMessage(
            chatId,
            { image: { url: imageUrl }, caption: `✨ Anime: ${type}` },
            { quoted: message }
        );
    } catch (sendError) {
        console.error('Error sending anime image:', sendError);
        await sock.sendMessage(
            chatId,
            { text: '❌ Failed to send anime image.' },
            { quoted: message }
        );
    }
}

async function animeCommand(sock, chatId, message, args) {
    const subArg = args && args[0] ? args[0] : '';
    const sub = normalizeType(subArg);

    const supported = [
        'nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink', 'face-palm'
    ];

    try {
        if (!sub) {
            await sock.sendMessage(chatId, {
                text: `*🎭⃤ Anime Reactions*\n\nUsage: .anime <type>\n\nAvailable types:\n${supported.map(t => `• ${t}`).join('\n')}`
            }, { quoted: message });
            return;
        }

        if (!supported.includes(sub)) {
            await sock.sendMessage(chatId, {
                text: `❌ Unsupported type: ${sub}\n\nTry one of: ${supported.join(', ')}`
            }, { quoted: message });
            return;
        }

        await sendAnimu(sock, chatId, message, sub);
    } catch (err) {
        console.error('Error in anime command:', err);
        await sock.sendMessage(chatId, {
            text: '❌ An error occurred while fetching anime reaction.'
        }, { quoted: message });
    }
}

module.exports = { animeCommand };
