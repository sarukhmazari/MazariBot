const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');

// Helper to prevent WhatsApp queries from hanging indefinitely
const withTimeout = async (promise, timeoutMs = 12000, errorMsg = 'Request timed out') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
    ]);
};

// Helper to resolve standard JIDs from LID JIDs using contact data, Baileys store, or auth mapping state
const resolveJid = async (sock, participant) => {
    if (!participant) return null;
    
    // 1. If it's already a standard JID, return it
    if (participant.id && participant.id.endsWith('@s.whatsapp.net')) {
        return participant.id;
    }

    // 2. Check if phoneNumber is provided and ends with @s.whatsapp.net
    if (participant.phoneNumber && participant.phoneNumber.endsWith('@s.whatsapp.net')) {
        return participant.phoneNumber;
    }

    // 3. Try to resolve via Baileys internal LID mapping store
    if (participant.id && participant.id.endsWith('@lid')) {
        try {
            if (sock.signalRepository?.lidMapping) {
                const resolved = await sock.signalRepository.lidMapping.getPNForLID(participant.id);
                if (resolved && resolved.endsWith('@s.whatsapp.net')) {
                    return resolved.replace(/:.*@/, '@');
                }
            }
        } catch (err) {
            console.error(`Error resolving LID ${participant.id} via lidMapping:`, err);
        }

        // 4. Fallback: Query the database/auth keys store directly
        const lidUser = participant.id.split('@')[0];
        try {
            if (sock.authState?.keys) {
                const stored = await sock.authState.keys.get('lid-mapping', [`${lidUser}_reverse`]);
                const pnUser = stored?.[`${lidUser}_reverse`];
                if (pnUser) {
                    return `${pnUser}@s.whatsapp.net`;
                }
            }
        } catch (dbErr) {
            console.error(`Error looking up LID ${participant.id} in auth keys:`, dbErr);
        }
    }

    return null;
};

/**
 * Handles the .add command to add participants to a group or transfer members via invite link.
 * @param {object} sock - The socket object.
 * @param {string} chatId - The JID of the group.
 * @param {string} senderId - The JID of the sender.
 * @param {Array} mentionedJids - List of mentioned JIDs.
 * @param {object} message - The original message object.
 */
async function addCommand(sock, chatId, senderId, mentionedJids, message) {
    // 1. Check if it's a group
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'This command can only be used in groups!' }, { quoted: message });
        return;
    }

    // 2. Extract numbers or link from text
    const text = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text || 
                 '';
    const textArgs = text.split(/\s+/).slice(1);

    const inviteLinkRegex = /(?:chat\.whatsapp\.com\/)([a-zA-Z0-9\-]+)/i;
    let foundInviteCode = null;
    
    for (const arg of textArgs) {
        const match = arg.match(inviteLinkRegex);
        if (match) {
            foundInviteCode = match[1];
            break;
        }
    }

    // 3. Privilege Checks
    const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);

    if (foundInviteCode) {

        try {
            let targetGroupId;
            let targetGroupMetadata;
            
            try {
                // Fetch group invite details from Baileys
                const inviteInfo = await withTimeout(
                    sock.groupGetInviteInfo(foundInviteCode),
                    12000,
                    'Fetching group invite info timed out'
                );
                targetGroupId = inviteInfo.id;
            } catch (e) {
                // If it fails, try to join it to get the JID
                try {
                    targetGroupId = await withTimeout(
                        sock.groupAcceptInvite(foundInviteCode),
                        15000,
                        'Joining group timed out'
                    );
                } catch (acceptError) {
                    console.error('Failed to resolve or join group invite link:', acceptError);
                    await sock.sendMessage(chatId, { text: '❌ Failed to resolve or join the target group invite link. Please make sure the link is active and valid.' }, { quoted: message });
                    return;
                }
            }

            if (!targetGroupId) {
                await sock.sendMessage(chatId, { text: '❌ Failed to resolve target group ID from the invite link.' }, { quoted: message });
                return;
            }

            // Retrieve target group metadata to get participants
            try {
                targetGroupMetadata = await withTimeout(
                    sock.groupMetadata(targetGroupId),
                    12000,
                    'Fetching target group metadata timed out'
                );
            } catch (metaError) {
                try {
                    await withTimeout(
                        sock.groupAcceptInvite(foundInviteCode),
                        15000,
                        'Joining target group timed out'
                    );
                    targetGroupMetadata = await withTimeout(
                        sock.groupMetadata(targetGroupId),
                        12000,
                        'Fetching target group metadata timed out'
                    );
                } catch (joinError) {
                    console.error('Failed to join target group or fetch metadata:', joinError);
                    await sock.sendMessage(chatId, { text: '❌ Failed to join target group or fetch its metadata. Make sure the bot is not banned from the group.' }, { quoted: message });
                    return;
                }
            }

            const botId = sock.user.id.replace(/:.*@/, '@');
            const targetParticipants = targetGroupMetadata.participants || [];

            const { isBotAdmin: isBotTargetAdmin } = await isAdmin(sock, targetGroupId, senderId);

            if (!isBotTargetAdmin) {
                await sock.sendMessage(chatId, { text: `❌ Failed to add members: The bot must be an administrator in the target group (*${targetGroupMetadata.subject || 'Target Group'}*) to add participants.` }, { quoted: message });
                return;
            }

            // Get source group metadata and participants
            let sourceGroupMetadata;
            try {
                sourceGroupMetadata = await withTimeout(
                    sock.groupMetadata(chatId),
                    12000,
                    'Fetching source group metadata timed out'
                );
            } catch (sourceError) {
                console.error('Failed to fetch source group metadata:', sourceError);
                await sock.sendMessage(chatId, { text: '❌ Failed to fetch current group details. Please try again.' }, { quoted: message });
                return;
            }
            const sourceParticipants = sourceGroupMetadata.participants || [];

            // Collect all resolved standard JIDs of target group participants
            const targetJids = new Set();
            for (const p of targetParticipants) {
                const resolved = await resolveJid(sock, p);
                if (resolved) {
                    targetJids.add(resolved.toLowerCase());
                } else if (p.id) {
                    targetJids.add(p.id.toLowerCase());
                }
            }

            // Filter and resolve participants to add
            const usersToAdd = [];
            for (const p of sourceParticipants) {
                const resolved = await resolveJid(sock, p);
                if (!resolved) continue;

                // Check if this participant is the bot
                const isBot = (
                    resolved === botId ||
                    resolved.split('@')[0] === botId.split('@')[0] ||
                    (sock.user.lid && resolved.split('@')[0] === sock.user.lid.split('@')[0])
                );
                if (isBot) continue;

                // Check if this participant is already in the target group
                if (!targetJids.has(resolved.toLowerCase())) {
                    usersToAdd.push(resolved);
                }
            }

            if (usersToAdd.length === 0) {
                await sock.sendMessage(senderId, { 
                    text: `ℹ️ No new members to add.\n\n*Debug Info:*\n- Source members: ${sourceParticipants.length}\n- Target members: ${targetParticipants.length}\n- Filtered source (bot removed): ${sourceParticipants.filter(p => p.id !== botId).length}\n- Target Group Name: *${targetGroupMetadata.subject || 'Unknown'}*` 
                });
                return;
            }

            // Start adding one-by-one with a strict 5-second delay as requested
            let successCount = 0;
            let privacyCount = 0;
            let alreadyMemberCount = 0;
            let failedCount = 0;
            let otherCount = 0;

            await sock.sendMessage(senderId, { text: `⏳ Starting transfer of ${usersToAdd.length} member(s). Adding one-by-one to avoid rate-limits (using 5-second delay)...` });

            for (let i = 0; i < usersToAdd.length; i++) {
                const userJid = usersToAdd[i];
                try {
                    const response = await sock.groupParticipantsUpdate(targetGroupId, [userJid], "add");
                    
                    const userStatus = response?.find(r => r.jid === userJid)?.status || 'unknown';
                    if (userStatus === '200') successCount++;
                    else if (userStatus === '403') privacyCount++;
                    else if (userStatus === '409') alreadyMemberCount++;
                    else if (userStatus === '500') failedCount++;
                    else otherCount++;
                } catch (singleError) {
                    console.error(`Failed to add user ${userJid}:`, singleError.message);
                    failedCount++;
                    
                    const statusCode = singleError.output?.statusCode || singleError.status;
                    if (singleError.message?.toLowerCase().includes('rate') || statusCode === 429) {
                        await sock.sendMessage(senderId, { text: `⚠️ WhatsApp rate-limit detected after adding ${successCount} member(s). Pausing addition for 30 seconds...` });
                        // Wait for 30 seconds to let the rate limit cool down
                        await new Promise(resolve => setTimeout(resolve, 30000));
                    } else if (statusCode === 403 || statusCode === 401 || singleError.message?.toLowerCase().includes('admin')) {
                        await sock.sendMessage(senderId, { text: `❌ Transfer stopped: The bot lost admin permissions in the target group.` });
                        return;
                    }
                }

                // Strict 5 second delay between each member transfer
                if (i + 1 < usersToAdd.length) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            // Send completion report privately to the sender
            if (usersToAdd.length > 0) {
                const reportText = `📊 *Transfer Summary*\n` +
                                   `Target Group: *${targetGroupMetadata.subject}*\n\n` +
                                   `✅ Added: *${successCount}*\n` +
                                   `⚠️ Privacy Blocked (Invite needed): *${privacyCount}*\n` +
                                   `ℹ️ Already Members: *${alreadyMemberCount}*\n` +
                                   `❌ Failed: *${failedCount + otherCount}*\n\n` +
                                   `👥 Total Processed: *${usersToAdd.length}*`;

                await sock.sendMessage(senderId, { text: reportText });
            }

        } catch (error) {
            console.error('Error in .add link command:', error);
        }
    } else {
        // Standard .add phone number command
        // Requires bot to be admin and sender to be admin (unless owner/sudo)
        if (!senderIsOwnerOrSudo) {
            const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: 'Please make the bot an admin first to use this command.' }, { quoted: message });
                return;
            }

            if (!isSenderAdmin) {
                await sock.sendMessage(chatId, { text: 'Only group admins can use the .add command.' }, { quoted: message });
                return;
            }
        } else {
            // Even if owner/sudo, the bot itself must be admin in current group to add participants directly
            const { isBotAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: 'Please make the bot an admin first to use this command.' }, { quoted: message });
                return;
            }
        }

        let usersToAdd = [];
        for (const arg of textArgs) {
            // Clean the number (remove +, spaces, -, etc.)
            let cleanNumber = arg.replace(/[^0-9]/g, '');
            
            // Basic validation for standard phone number length
            if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
                const jid = cleanNumber + '@s.whatsapp.net';
                if (!usersToAdd.includes(jid)) {
                    usersToAdd.push(jid);
                }
            }
        }

        if (usersToAdd.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide a phone number to add or a group invite link!\n\n*Example:* `.add 923232391033` or `.add https://chat.whatsapp.com/LMN...`'
            }, { quoted: message });
            return;
        }

        try {
            // Send "processing" indicator
            await sock.sendMessage(chatId, { text: `⏳ Trying to add ${usersToAdd.length} user(s)...` }, { quoted: message });

            // Execute Baileys add command
            const response = await sock.groupParticipantsUpdate(chatId, usersToAdd, "add");
            
            let feedback = [];
            
            for (const userJid of usersToAdd) {
                const userStatus = response.find(r => r.jid === userJid)?.status || 'unknown';
                const shortName = `@${userJid.split('@')[0]}`;
                
                switch (userStatus) {
                    case '200':
                        feedback.push(`✅ ${shortName} added successfully!`);
                        break;
                    case '403':
                        feedback.push(`⚠️ ${shortName} has privacy settings that require an invite link.`);
                        break;
                    case '408':
                        feedback.push(`🚫 ${shortName} recently left the group and cannot be added back yet.`);
                        break;
                    case '409':
                        feedback.push(`ℹ️ ${shortName} is already a member of this group.`);
                        break;
                    case '500':
                        feedback.push(`❌ Failed to add ${shortName} (Group might be full).`);
                        break;
                    default:
                        feedback.push(`❌ Failed to add ${shortName} (Status: ${userStatus})`);
                }
            }

            await sock.sendMessage(chatId, { 
                text: feedback.join('\n'),
                mentions: usersToAdd
            }, { quoted: message });

        } catch (error) {
            console.error('Error in add command:', error);
            await sock.sendMessage(chatId, { 
                text: '❌ Critical error occurred while attempting to add participants.' 
            }, { quoted: message });
        }
    }
}

module.exports = addCommand;
