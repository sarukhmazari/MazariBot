const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function tourlCommand(sock, chatId, text, message) {
    let targetMessage = message;

    // Check if the message is a reply containing media
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = message.message.extendedTextMessage.contextInfo;
        targetMessage = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }

    const mediaMessage = targetMessage.message?.imageMessage || 
                          targetMessage.message?.videoMessage || 
                          targetMessage.message?.audioMessage ||
                          targetMessage.message?.documentMessage ||
                          targetMessage.message?.stickerMessage;

    if (!mediaMessage) {
        await sock.sendMessage(chatId, { 
            text: '❌ Please reply to an image, video, audio, sticker, or document with `.tourl`.' 
        }, { quoted: message });
        return;
    }

    try {
        // Send loading reaction
        try {
            await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
        } catch (e) {}

        // Download media
        const buffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) {
            await sock.sendMessage(chatId, { text: '❌ Failed to download media. Please try again.' }, { quoted: message });
            return;
        }

        // Get extension from mime type
        const mime = mediaMessage.mimetype || 'application/octet-stream';
        let ext = 'bin';
        if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
        else if (mime.includes('png')) ext = 'png';
        else if (mime.includes('mp4')) ext = 'mp4';
        else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
        else if (mime.includes('ogg')) ext = 'ogg';
        else if (mime.includes('webp')) ext = 'webp';
        else if (mime.includes('pdf')) ext = 'pdf';
        else {
            const split = mime.split('/');
            if (split[1]) ext = split[1];
        }

        const filename = `upload_${Date.now()}.${ext}`;
        let fileUrl = '';

        // Primary: Catbox
        try {
            const bodyForm = new FormData();
            bodyForm.append('fileToUpload', buffer, { filename, contentType: mime });
            bodyForm.append('reqtype', 'fileupload');

            const uploadResponse = await axios.post('https://catbox.moe/user/api.php', bodyForm, {
                headers: {
                    ...bodyForm.getHeaders()
                },
                timeout: 15000
            });

            const url = uploadResponse.data?.trim();
            if (url && url.startsWith('http')) {
                fileUrl = url;
            }
        } catch (catboxError) {
            console.error('Catbox upload failed, trying fallback:', catboxError.message);
        }

        // Secondary / Fallback: Tmpfiles
        if (!fileUrl) {
            try {
                const bodyForm = new FormData();
                bodyForm.append('file', buffer, { filename, contentType: mime });

                const uploadResponse = await axios.post('https://tmpfiles.org/api/v1/upload', bodyForm, {
                    headers: {
                        ...bodyForm.getHeaders()
                    },
                    timeout: 20000
                });

                const rawUrl = uploadResponse.data?.data?.url;
                if (rawUrl && rawUrl.startsWith('http')) {
                    // Convert to direct download link: https://tmpfiles.org/123/name -> https://tmpfiles.org/dl/123/name
                    fileUrl = rawUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                }
            } catch (fallbackError) {
                console.error('Fallback upload to tmpfiles also failed:', fallbackError.message);
            }
        }

        if (fileUrl && fileUrl.startsWith('http')) {
            await sock.sendMessage(chatId, { 
                text: `✅ *Media Uploaded Successfully!*\n\n🔗 *URL:* ${fileUrl}\n\n_Note: This link is permanent/long-term and public._` 
            }, { quoted: message });
        } else {
            throw new Error('All file hosting endpoints failed');
        }

    } catch (error) {
        console.error('Error in tourl command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to upload media to URL. Please try again later.' }, { quoted: message });
    }
}

module.exports = tourlCommand;
