const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const webp = require('node-webpmux');
const sharp = require('sharp');
const settings = require('../settings');

const colors = [
    '#0df5c4', // Cyan
    '#f5d50d', // Yellow
    '#f50db5', // Pink
    '#0d9bf5', // Blue
    '#f57c0d', // Orange
    '#1df50d', // Green
    '#ab47bc', // Purple
    '#2e7d32', // Dark Green
    '#c2185b', // Deep Pink
    '#e65100'  // Dark Orange
];

function getSenderColor(jid) {
    let hash = 0;
    const cleanJid = jid || 'user';
    for (let i = 0; i < cleanJid.length; i++) {
        hash = cleanJid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

async function qcCommand(sock, chatId, text, message) {
    let quotedInfo = message.message?.extendedTextMessage?.contextInfo;
    let quotedMsg = quotedInfo?.quotedMessage;
    let textToQuote = text || '';

    // If it's a reply, use the replied message text instead of args
    if (quotedMsg) {
        textToQuote = quotedMsg.conversation || 
                      quotedMsg.extendedTextMessage?.text || 
                      quotedMsg.imageMessage?.caption || 
                      quotedMsg.videoMessage?.caption || '';
    }

    if (!textToQuote) {
        await sock.sendMessage(chatId, { text: '❌ Please reply to a text message or write text after the command to create a quote sticker.' });
        return;
    }

    // React to let the user know we are working on it
    try {
        await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });
    } catch (e) {}

    const senderJid = quotedInfo?.participant || quotedInfo?.sender || message.key.participant || message.key.remoteJid;
    let senderName = message.pushName || 'User';
    if (quotedInfo && quotedInfo.participant) {
        senderName = quotedInfo.participant.split('@')[0];
    }
    
    // Clean name for display
    if (senderName.includes('@')) {
        senderName = senderName.split('@')[0];
    }

    let profilePicUrl = '';
    try {
        profilePicUrl = await sock.profilePictureUrl(senderJid, 'image');
    } catch (e) {}

    // Fetch profile picture as Base64 Data URI
    let avatarBase64 = '';
    if (profilePicUrl) {
        try {
            const avatarRes = await axios.get(profilePicUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const mime = avatarRes.headers['content-type'] || 'image/jpeg';
            avatarBase64 = `data:${mime};base64,${Buffer.from(avatarRes.data).toString('base64')}`;
        } catch (e) {
            console.error('QC: Failed to fetch profile picture:', e.message);
        }
    }

    // Calculate height dynamically
    const lines = textToQuote.split('\n');
    let linesCount = 0;
    for (const line of lines) {
        linesCount += Math.max(1, Math.ceil(line.length / 28));
    }
    const nameColor = getSenderColor(senderJid);
    const estimatedHeight = Math.max(120, 80 + linesCount * 22 + (senderName ? 22 : 0));

    // Escape HTML special characters
    const formattedText = textToQuote
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

    // Build SVG
    let avatarHtml = `<image x="15" y="15" width="60" height="60" href="${avatarBase64}" clip-path="url(#circleView)" />`;
    if (!avatarBase64) {
        // High quality fallback vector avatar
        avatarHtml = `
          <g clip-path="url(#circleView)">
            <circle cx="45" cy="45" r="30" fill="#374151" />
            <circle cx="45" cy="35" r="11" fill="#9ca3af" />
            <path d="M 23 58 C 23 46, 67 46, 67 58 Z" fill="#9ca3af" />
          </g>
        `;
    }

    const svg = `
    <svg width="512" height="${estimatedHeight}" viewBox="0 0 512 ${estimatedHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="circleView">
          <circle cx="45" cy="45" r="30" />
        </clipPath>
      </defs>
      
      <!-- Avatar -->
      ${avatarHtml}
      
      <!-- Chat Bubble Content via foreignObject -->
      <foreignObject x="90" y="15" width="400" height="${estimatedHeight - 30}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          background-color: #202c33;
          color: #e9edef;
          border-radius: 0px 16px 16px 16px;
          padding: 12px 16px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 1px 0.5px rgba(11,20,26,.13);
          display: inline-block;
          max-width: 360px;
        ">
          ${senderName ? `<div style="color: ${nameColor}; font-weight: bold; font-size: 15px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px;">${senderName}</div>` : ''}
          <div style="font-size: 15px; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap;">${formattedText}</div>
        </div>
      </foreignObject>
    </svg>
    `;

    try {
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const tempOutput = path.join(tmpDir, `qc_${Date.now()}.webp`);

        // Render SVG directly to WebP sticker size using sharp
        await sharp(Buffer.from(svg))
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 80 })
            .toFile(tempOutput);

        const webpBuffer = fs.readFileSync(tempOutput);

        // Add sticker metadata
        const img = new webp.Image();
        await img.load(webpBuffer);

        const json = {
            'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
            'sticker-pack-name': settings.packname || 'MazariBot',
            'sticker-pack-publisher': settings.author || 'Sarukh Mazari',
            'emojis': ['🤖']
        };

        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        img.exif = exif;

        const finalBuffer = await img.save(null);

        // Send Sticker
        await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: message });

        // Clean up
        try {
            fs.unlinkSync(tempOutput);
        } catch (e) {}

    } catch (error) {
        console.error('Error generating local webp sticker for QC:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to process sticker image.' });
    }
}

module.exports = qcCommand;
