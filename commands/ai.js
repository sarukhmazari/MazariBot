const axios = require('axios');
const fetch = require('node-fetch');

async function aiCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: "Please provide a question after .gpt or .gemini\n\nExample: .gpt write a basic html code"
            }, { quoted: message });
        }

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { text: "Please provide a question" }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });

        const apis = command === '.gemini' ? [
            `https://vapis.my.id/api/gemini?q=${encodeURIComponent(query)}`,
            `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(query)}`,
            `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}`,
            `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(query)}`
        ] : [
            `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(query)}`,
            `https://api.ryzendesu.vip/api/ai/chatgpt?text=${encodeURIComponent(query)}`,
            `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`,
            `https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(query)}`
        ];

        for (const api of apis) {
            try {
                const response = await fetch(api);
                const data = await response.json();

                if (data.message || data.data || data.answer || data.result) {
                    const answer = data.message || data.data || data.answer || data.result;
                    await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                    return;
                }
            } catch (e) {
                continue;
            }
        }
        throw new Error('All AI APIs failed');


    } catch (error) {
        console.error('AI Command Error:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Failed to get response. The API might be down. Please try again later.",
            contextInfo: { mentionedJid: [message.key.participant || message.key.remoteJid], quotedMessage: message.message }
        }, { quoted: message });
    }
}

module.exports = aiCommand;