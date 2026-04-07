/**
 * Knight Bot - WhatsApp Bot
 * Auto React System (Fully Fixed)
 */

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const configPath = path.join(__dirname, '..', 'data', 'react.json');

const defaultData = {
    autoreact: false,
    reactEmojis: [
        "🪀",
        "🥏",
        "🤩",
        "💔",
        "🕐️",
        "🤍",
        "🥵"
    ]
};

// Ensure config exists and is defaulted to OFF
function initConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            // Default is turned OFF
            fs.writeFileSync(configPath, JSON.stringify(defaultData, null, 2));
        }
        return JSON.parse(fs.readFileSync(configPath));
    } catch (err) {
        console.error("Config error:", err);
        return defaultData; // Failsafe default to off
    }
}

// Command to toggle autoreact (.autoreact on / .autoreact off)
async function autoreactCommand(sock, chatId, message, args = []) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!message.key.fromMe && !isOwner) {
            return sock.sendMessage(chatId, {
                text: '❌ This command is only for the owner!'
            });
        }

        const config = initConfig();

        if (args.length > 0) {
            const action = args[0].toLowerCase();

            if (action === 'on' || action === 'enable') {
                config.autoreact = true;
            } else if (action === 'off' || action === 'disable') {
                config.autoreact = false;
            } else {
                return sock.sendMessage(chatId, {
                    text: '❌ Use: .autoreact on/off'
                });
            }
        } else {
            config.autoreact = !config.autoreact;
        }

        // Preserve reactEmojis if toggling via command
        if (!config.reactEmojis) {
            config.reactEmojis = defaultData.reactEmojis;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        await sock.sendMessage(chatId, {
            text: `✅ Auto-react is now ${config.autoreact ? 'ENABLED' : 'DISABLED'}`
        });

    } catch (error) {
        console.error(error);
        await sock.sendMessage(chatId, { text: '❌ Error occurred!' });
    }
}

// Check status
function isAutoreactEnabled() {
    try {
        const config = initConfig();
        return config.autoreact;
    } catch {
        return false;
    }
}

// React function
async function addAutoReaction(sock, message) {
    try {
        // 1. Check if the feature is enabled
        if (!isAutoreactEnabled()) return;

        // 2. Ensure message is valid
        if (!message?.key?.id) return;

        // 3. Prevent reacting to the bot's own messages (Reacts to INCOMING only)
        if (message.key.fromMe) return;

        // 4. Skip for owners (they get priority special reaction)
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, message.key.remoteJid);
        if (isOwner) return;

        const remoteJid = message.key.remoteJid;

        // 4. Ignore status broadcasts, but ALLOW Groups, Personal Chats, and Channels (@newsletter)
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        // 5. Select a random emoji from the react.json config
        const config = initConfig();
        const emojis = Array.isArray(config.reactEmojis) && config.reactEmojis.length > 0
            ? config.reactEmojis
            : defaultData.reactEmojis;

        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        // 6. Send the reaction
        await sock.sendMessage(remoteJid, {
            react: {
                text: emoji,
                key: message.key
            }
        });

    } catch (err) {
        console.error("AutoReact Error:", err);
    }
}

module.exports = {
    autoreactCommand,
    isAutoreactEnabled,
    addAutoReaction
};