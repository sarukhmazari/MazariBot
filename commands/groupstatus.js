const { downloadContentFromMessage, generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');
const { getGroupMetadata } = require('../lib/myfunc');

/**
 * .groupstatus / .gpstatus / .gstatus command
 * Posts a status update specifically for the group (shows up as a ring around the group profile logo).
 */
async function groupstatusCommand(sock, chatId, senderId, message, args) {
    try {
        console.log(`[GROUP-STATUS] Command triggered by ${senderId} in ${chatId}`);

        const isGroup = chatId.endsWith('@g.us');
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        // 1. Group / Permission checks
        if (isGroup) {
            const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isSenderAdmin && !isOwner) {
                console.log('[GROUP-STATUS] Failed: Unauthorized user');
                return await sock.sendMessage(chatId, { text: '❌ Only group admins or bot owner can use this command' }, { quoted: message });
            }

            // Check if group is closed for chat (announcement mode)
            const metadata = await getGroupMetadata(sock, chatId);
            const isClosed = metadata?.announce === true || metadata?.announce === 'announcement';
            if (isClosed && !isBotAdmin) {
                console.log('[GROUP-STATUS] Failed: Group is closed for chat and bot is not admin');
                return await sock.sendMessage(chatId, { text: '❌ The group is closed for chat (Only Admins can send messages), and the bot is not an admin. Please promote the bot to admin to post group status.' }, { quoted: message });
            }
        } else {
            // Private chat - only owner/sudo can trigger global group status broadcast
            if (!isOwner) {
                console.log('[GROUP-STATUS] Failed: Private chat unauthorized trigger');
                return await sock.sendMessage(chatId, { text: '❌ Only the bot owner or sudo can use this command in private chat' }, { quoted: message });
            }
        }

        // 2. Check for replied media or text
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const textArg = args.join(' ').trim();

        let content = null;

        if (quoted) {
            // Replied to a message - extract media or text
            const contentUnpacked = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
            
            let mediaType = '';
            let mediaKey = null;

            if (contentUnpacked.imageMessage) {
                mediaType = 'image';
                mediaKey = contentUnpacked.imageMessage;
            } else if (contentUnpacked.videoMessage) {
                mediaType = 'video';
                mediaKey = contentUnpacked.videoMessage;
            } else if (contentUnpacked.audioMessage) {
                mediaType = 'audio';
                mediaKey = contentUnpacked.audioMessage;
            }

            if (mediaKey) {
                await sock.sendMessage(chatId, { text: `⏳ Downloading and uploading media to group status...` }, { quoted: message });

                // Download media buffer
                const stream = await downloadContentFromMessage(mediaKey, mediaType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                if (buffer.length === 0) {
                    throw new Error('Downloaded media buffer is empty');
                }

                // Generate WA Message Content (handles uploading to WA servers)
                const mediaGen = {};
                let statusSourceType = 4; // default to TEXT
                
                if (mediaType === 'image') {
                    mediaGen.image = buffer;
                    if (textArg) mediaGen.caption = textArg;
                    statusSourceType = 0; // IMAGE
                } else if (mediaType === 'video') {
                    mediaGen.video = buffer;
                    if (textArg) mediaGen.caption = textArg;
                    statusSourceType = 1; // VIDEO
                } else if (mediaType === 'audio') {
                    mediaGen.audio = buffer;
                    mediaGen.mimetype = mediaKey.mimetype || 'audio/mp4';
                    mediaGen.ptt = true;
                    statusSourceType = 3; // AUDIO
                }

                content = await generateWAMessageContent(mediaGen, { upload: sock.waUploadToServer });
                
                // Inject context info for group status metadata into inner media message
                const messageType = Object.keys(content)[0];
                if (messageType && content[messageType]) {
                    content[messageType].contextInfo = {
                        ...(content[messageType].contextInfo || {}),
                        isGroupStatus: true,
                        statusSourceType: statusSourceType,
                        statusAttributions: [
                            {
                                groupStatus: {
                                    authorJid: senderId
                                }
                            }
                        ]
                    };
                }
            } else {
                // Non-media message reply (text, document, buttons, templates, etc.)
                const quotedText = contentUnpacked.conversation ||
                                   contentUnpacked.extendedTextMessage?.text ||
                                   contentUnpacked.imageMessage?.caption ||
                                   contentUnpacked.videoMessage?.caption ||
                                   contentUnpacked.documentMessage?.caption ||
                                   contentUnpacked.documentMessage?.fileName ||
                                   contentUnpacked.documentMessage?.title ||
                                   contentUnpacked.caption ||
                                   contentUnpacked.text ||
                                   contentUnpacked.contentText ||
                                   contentUnpacked.selectedDisplayText ||
                                   contentUnpacked.title ||
                                   '';
                const statusText = textArg || quotedText;
                if (!statusText) {
                    console.log('[GROUP-STATUS] Failed: Quoted message has no text and no text argument was provided');
                    return await sock.sendMessage(chatId, { text: '❌ Please provide text or reply to a message with text/media to set a group status.' }, { quoted: message });
                }

                // Text status configuration
                content = {
                    extendedTextMessage: {
                        text: statusText,
                        backgroundArgb: 4278241280, // Black color (Alpha: 255, R: 0, G: 0, B: 0)
                        font: 1,
                        contextInfo: {
                            isGroupStatus: true,
                            statusSourceType: 4, // TEXT
                            statusAttributions: [
                                {
                                    groupStatus: {
                                        authorJid: senderId
                                    }
                                }
                            ]
                        }
                    }
                };
            }
        } else {
            // No media quoted - send text status
            if (!textArg) {
                console.log('[GROUP-STATUS] Failed: No content provided');
                return await sock.sendMessage(chatId, { text: '❌ Please provide text or reply to media to set a group status.\nExample: `.groupstatus Hello group!`' }, { quoted: message });
            }

            // Text status configuration
            content = {
                extendedTextMessage: {
                    text: textArg,
                    backgroundArgb: 4278241280, // Black color (Alpha: 255, R: 0, G: 0, B: 0)
                    font: 1,
                    contextInfo: {
                        isGroupStatus: true,
                        statusSourceType: 4, // TEXT
                        statusAttributions: [
                            {
                                groupStatus: {
                                    authorJid: senderId
                                }
                            }
                        ]
                    }
                }
            };
        }

        if (!content) {
            throw new Error('Failed to generate message content');
        }

        // 3. Determine targets
        let targetGroupJids = [];
        let groupMetadata = null;
        if (isGroup) {
            targetGroupJids = [chatId];
        } else {
            console.log('[GROUP-STATUS] Fetching participating groups for global broadcast...');
            groupMetadata = await sock.groupFetchAllParticipating();
            targetGroupJids = Object.keys(groupMetadata);
            if (targetGroupJids.length === 0) {
                return await sock.sendMessage(chatId, { text: '❌ The bot is not in any groups.' }, { quoted: message });
            }
            await sock.sendMessage(chatId, { text: `⏳ Found ${targetGroupJids.length} groups. Broadcasting status update...` }, { quoted: message });
        }

        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const targetJid of targetGroupJids) {
            try {
                // If broadcasting, check if the group is closed and the bot is not admin
                if (!isGroup && groupMetadata) {
                    const metadata = groupMetadata[targetJid];
                    const isClosed = metadata?.announce === true || metadata?.announce === 'announcement';
                    
                    if (isClosed) {
                        const participants = metadata?.participants || [];
                        const botId = sock.user?.id || '';
                        const botLid = sock.user?.lid || '';
                        const botNumber = botId.includes(':') ? botId.split(':')[0] : (botId.includes('@') ? botId.split('@')[0] : botId);
                        const botIdWithoutSuffix = botId.includes('@') ? botId.split('@')[0] : botId;
                        const botLidNumeric = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
                        const botLidWithoutSuffix = botLid.includes('@') ? botLid.split('@')[0] : botLid;
                        
                        const isBotAdmin = participants.some(p => {
                            const pPhoneNumber = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
                            const pId = p.id ? p.id.split('@')[0] : '';
                            const pLid = p.lid ? p.lid.split('@')[0] : '';
                            const pFullId = p.id || '';
                            const pFullLid = p.lid || '';
                            const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : pLid;
                            
                            const botMatches = (
                                botId === pFullId || 
                                botId === pFullLid || 
                                botLid === pFullLid || 
                                botLidNumeric === pLidNumeric || 
                                botLidWithoutSuffix === pLid || 
                                botNumber === pPhoneNumber || 
                                botNumber === pId || 
                                botIdWithoutSuffix === pPhoneNumber || 
                                botIdWithoutSuffix === pId || 
                                (botLid && botLid.split('@')[0].split(':')[0] === pLid)
                            );
                            return botMatches && (p.admin === 'admin' || p.admin === 'superadmin');
                        });
                        
                        if (!isBotAdmin) {
                            console.log(`[GROUP-STATUS] Skipping ${targetJid}: Closed group and bot is not admin`);
                            skippedCount++;
                            continue;
                        }
                    }
                }

                // Send the groupStatusMessage via relayMessage to bypass generateWAMessageContent validation
                console.log(`[GROUP-STATUS] Relaying group status to: ${targetJid}`);
                const messageToSend = generateWAMessageFromContent(
                    targetJid,
                    {
                        groupStatusMessage: {
                            message: content
                        },
                        groupStatusMessageV2: {
                            message: content
                        }
                    },
                    {
                        userJid: sock.user.id
                    }
                );

                await sock.relayMessage(targetJid, messageToSend.message, {
                    messageId: messageToSend.key.id
                });
                successCount++;

                // Add a minor delay if broadcasting to multiple groups to prevent spam blocks
                if (!isGroup && targetGroupJids.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (err) {
                console.error(`[GROUP-STATUS] Failed to send status to ${targetJid}:`, err);
                failCount++;
            }
        }

        if (isGroup) {
            if (successCount > 0) {
                await sock.sendMessage(chatId, { text: '✅ Group Status posted successfully! Tap the group icon to view.' }, { quoted: message });
            } else {
                throw new Error('Failed to relay message to the group');
            }
        } else {
            await sock.sendMessage(chatId, { text: `✅ Status broadcast complete!\n🟢 Success: ${successCount} groups\n🟡 Skipped (Closed + Bot Not Admin): ${skippedCount} groups\n🔴 Failed: ${failCount} groups` }, { quoted: message });
        }

    } catch (error) {
        console.error('[GROUP-STATUS] Critical Error:', error);
        await sock.sendMessage(chatId, { text: `❌ Failed to set group status.\nError: ${error.message}` }, { quoted: message });
    }
}

module.exports = groupstatusCommand;
