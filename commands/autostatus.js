const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '',
            newsletterName: 'MAZARI BOT',
            serverMessageId: -1
        }
    }
};

// Path to store auto status configuration
const configPath = path.join(__dirname, '../data/autoStatus.json');

// Initialize config file if it doesn't exist
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
        enabled: false,
        reactOn: false
    }));
}

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command can only be used by the owner!',
                ...channelInfo
            });
            return;
        }

        // Read current config
        let config = JSON.parse(fs.readFileSync(configPath));

        // If no arguments, show current status
        if (!args || args.length === 0) {
            const status = config.enabled ? 'enabled' : 'disabled';
            const reactStatus = config.reactOn ? 'enabled' : 'disabled';
            await sock.sendMessage(chatId, {
                text: `🔄 *Auto Status Settings*\n\n📱 *Auto Status View:* ${status}\n💫 *Status Reactions:* ${reactStatus}\n\n*Commands:*\n.autostatus on - Enable auto status view\n.autostatus off - Disable auto status view\n.autostatus react on - Enable status reactions\n.autostatus react off - Disable status reactions`,
                ...channelInfo
            });
            return;
        }

        // Handle on/off commands
        const command = args[0].toLowerCase();

        if (command === 'on') {
            config.enabled = true;
            fs.writeFileSync(configPath, JSON.stringify(config));
            await sock.sendMessage(chatId, {
                text: '✅ Auto status view has been enabled!\nBot will now automatically view all contact statuses.',
                ...channelInfo
            });
        } else if (command === 'off') {
            config.enabled = false;
            fs.writeFileSync(configPath, JSON.stringify(config));
            await sock.sendMessage(chatId, {
                text: '❌ Auto status view has been disabled!\nBot will no longer automatically view statuses.',
                ...channelInfo
            });
        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, {
                    text: '❌ Please specify on/off for reactions!\nUse: .autostatus react on/off',
                    ...channelInfo
                });
                return;
            }

            const reactCommand = args[1].toLowerCase();
            if (reactCommand === 'on') {
                config.reactOn = true;
                fs.writeFileSync(configPath, JSON.stringify(config));
                await sock.sendMessage(chatId, {
                    text: '💫 Status reactions have been enabled!\nBot will now react to status updates.',
                    ...channelInfo
                });
            } else if (reactCommand === 'off') {
                config.reactOn = false;
                fs.writeFileSync(configPath, JSON.stringify(config));
                await sock.sendMessage(chatId, {
                    text: '❌ Status reactions have been disabled!\nBot will no longer react to status updates.',
                    ...channelInfo
                });
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Invalid reaction command! Use: .autostatus react on/off',
                    ...channelInfo
                });
            }
        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid command! Use:\n.autostatus on/off - Enable/disable auto status view\n.autostatus react on/off - Enable/disable status reactions',
                ...channelInfo
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error occurred while managing auto status!\n' + error.message,
            ...channelInfo
        });
    }
}

// Function to check if auto status is enabled
function isAutoStatusEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath));
        return config.enabled;
    } catch (error) {
        console.error('Error checking auto status config:', error);
        return false;
    }
}

// Function to check if status reactions are enabled
function isStatusReactionEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath));
        return config.reactOn;
    } catch (error) {
        console.error('Error checking status reaction config:', error);
        return false;
    }
}

// Function to react to status using proper method
async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) {
            return;
        }

        // Use the proper relayMessage method for status reactions
        await sock.relayMessage(
            'status@broadcast',
            {
                reactionMessage: {
                    key: {
                        remoteJid: 'status@broadcast',
                        id: statusKey.id,
                        participant: statusKey.participant || statusKey.remoteJid,
                        fromMe: false
                    },
                    text: '💚'
                }
            },
            {
                messageId: statusKey.id,
                statusJidList: [statusKey.remoteJid, statusKey.participant || statusKey.remoteJid]
            }
        );

        // Removed success log - only keep errors
    } catch (error) {
        console.error('❌ Error reacting to status:', error.message);
    }
}

const { loadUserGroupData, getStatusRestriction } = require('../lib/index');

// Function to handle status updates and check for restricted mentions
async function handleStatusUpdate(sock, status) {
    try {
        // Fast paths: skip if no status message
        if (!status.messages || status.messages.length === 0) return;
        const msg = status.messages[0];
        if (msg.key?.remoteJid !== 'status@broadcast') return;

        const sender = msg.key.participant || msg.key.remoteJid;
        console.log(`📡 [STATUS-LOG] Received status update from: ${sender}`);

        const botId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';

        // 1. Process Auto-View (as before)
        if (isAutoStatusEnabled()) {
            try {
                await sock.readMessages([msg.key]);
                await reactToStatus(sock, msg.key);
            } catch (e) { }
        }

        // 2. Status Mention Restriction Check
        const data = loadUserGroupData();
        const restrictedGroups = Object.keys(data.statusRestriction || {}).filter(gid => data.statusRestriction[gid] === false);

        if (restrictedGroups.length === 0) return;

        // Check content for mentions or links
        let rawText = (msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '').toLowerCase();

        console.log(`📝 [STATUS-TEXT] From: ${sender} | Content: "${rawText}"`);

        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const isBotMentioned = mentions.includes(botId);

        // Regex for WhatsApp group links
        const hasGroupLink = /chat\.whatsapp\.com\/[a-zA-Z0-9]+/i.test(rawText) || rawText.includes('whatsapp.com/g/');

        if (isBotMentioned || hasGroupLink) {
            console.log(`🎯 [STATUS-TRIGGER] Match found! BotMention=${isBotMentioned}, Link=${hasGroupLink} from ${sender}`);

            for (const groupId of restrictedGroups) {
                try {
                    const groupMetadata = await sock.groupMetadata(groupId);

                    // Verify Bot Admin Status
                    const normalizedBotId = botId.split('@')[0];
                    const botHandle = groupMetadata.participants.find(p => p.id.split('@')[0] === normalizedBotId);
                    const isBotAdmin = botHandle?.admin || botHandle?.isAdmin || false;

                    if (!isBotAdmin) {
                        console.warn(`⚠️ [STATUS] Bot not admin in ${groupId}. Cannot kick ${sender}.`);
                        continue;
                    }

                    const senderNum = sender.split('@')[0];
                    const participant = groupMetadata.participants.find(p => {
                        const pid = p.id.split('@')[0];
                        const plid = p.lid ? p.lid.split('@')[0] : '';
                        return pid === senderNum || plid === senderNum;
                    });

                    if (participant) {
                        const targetJid = participant.id;
                        console.log(`👢 [KICK] Removing member ${targetJid} (Status from ${sender}) from ${groupId} for status violation.`);

                        // KICK THE MEMBER (Use their real group JID)
                        await sock.groupParticipantsUpdate(groupId, [targetJid], 'remove');
                        await sock.sendMessage(groupId, {
                            text: `🚫 @${targetJid.split('@')[0]} has been kicked for sharing this group/mentioning us in their status while restricted! (Status Mention Policy)`,
                            mentions: [targetJid]
                        });
                    } else {
                        // Optional: console.log(`ℹ️ [DEBUG] Sender ${sender} was not found in group ${groupId}.`);
                    }
                } catch (err) {
                    console.error(`❌ [ERROR] Enforcing status restriction in ${groupId}:`, err.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ [ERROR] handleStatusUpdate:', error.message);
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate
}; 