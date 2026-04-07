const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');
const { getGroupMetadata } = require('../lib/myfunc');

/**
 * .tostatus command - COMPLETELY CLEAN status upload (No text, no caption)
 */
async function tostatusCommand(sock, chatId, senderId, message) {
    try {
        console.log(`[STATUS-UPLOAD] Command triggered by ${senderId} in ${chatId}`);

        // 1. Group check
        if (!chatId.endsWith('@g.us')) {
            console.log('[STATUS-UPLOAD] Failed: Not a group');
            return await sock.sendMessage(chatId, { text: '❌ This command works only in groups' }, { quoted: message });
        }

        // 2. Permission check
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!isSenderAdmin && !isOwner) {
            console.log('[STATUS-UPLOAD] Failed: Unauthorized user');
            return await sock.sendMessage(chatId, { text: '❌ Only group admins or bot owner can use this command' }, { quoted: message });
        }

        // 3. Extract replied media
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            console.log('[STATUS-UPLOAD] Failed: No quoted message');
            return await sock.sendMessage(chatId, { text: '❌ Reply to a media message' }, { quoted: message });
        }

        // Unpack View-Once if necessary
        const content = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
        
        let mediaType = '';
        let mediaKey = null;

        if (content.imageMessage) {
            mediaType = 'image';
            mediaKey = content.imageMessage;
        } else if (content.videoMessage) {
            mediaType = 'video';
            mediaKey = content.videoMessage;
        } else if (content.audioMessage) {
            mediaType = 'audio';
            mediaKey = content.audioMessage;
        }

        if (!mediaKey) {
            console.log('[STATUS-UPLOAD] Failed: Quoted message is not media');
            return await sock.sendMessage(chatId, { text: '❌ Reply to a media message (Image/Video/Audio)' }, { quoted: message });
        }

        // 4. Download media buffer
        console.log(`[STATUS-UPLOAD] Downloading ${mediaType}...`);
        await sock.sendMessage(chatId, { text: `⏳ Processing extraction and posting clean ${mediaType} status...` }, { quoted: message });
        
        const stream = await downloadContentFromMessage(mediaKey, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (buffer.length === 0) {
            throw new Error('Downloaded buffer is empty');
        }

        // 5. Get distribution list (Group members)
        const metadata = await getGroupMetadata(sock, chatId);
        const participants = metadata?.participants || [];
        const statusJidList = participants.map(p => p.id);

        // 6. COMPLETELY CLEAN Status Broadcast
        console.log('[STATUS-UPLOAD] Dispatching to status@broadcast (Completely Clean)...');
        
        const statusOptions = {
            statusJidList: statusJidList,
            backgroundColor: '#000000',
            font: 1
            // Removed contextInfo and mentions for complete cleanliness
        };

        if (mediaType === 'image') {
            await sock.sendMessage('status@broadcast', { 
                image: buffer
                // No caption included
            }, statusOptions);
        } else if (mediaType === 'video') {
            await sock.sendMessage('status@broadcast', { 
                video: buffer, 
                mimetype: mediaKey.mimetype || 'video/mp4'
                // No caption included
            }, statusOptions);
        } else if (mediaType === 'audio') {
            // Audio status: still requires ptt flag but no metadata
            await sock.sendMessage('status@broadcast', { 
                audio: buffer, 
                mimetype: mediaKey.mimetype || 'audio/mp4',
                ptt: true 
            }, statusOptions);
        }

        // 7. Success confirmation in the group
        console.log('[STATUS-UPLOAD] Success: Completely clean status posted');
        await sock.sendMessage(chatId, { text: `✅ Clean ${mediaType} posted to status with no text.` }, { quoted: message });

    } catch (error) {
        console.error('[STATUS-UPLOAD] Critical Error:', error);
        await sock.sendMessage(chatId, { text: `❌ Failed to upload clean media to status.\nError: ${error.message}` }, { quoted: message });
    }
}

module.exports = tostatusCommand;
