const express = require('express');
const cors = require('cors');
const { sessions } = require('./baileys-helper');
require('dotenv').config();

function startAdminApi() {
    const app = express();
    const port = process.env.ADMIN_PORT || 3000;
    
    // Check for API key in .env, fallback to a default one if not set
    const apiKey = process.env.ADMIN_API_KEY || 'mazari_secret_key';

    app.use(cors());
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

    // Endpoint 1: Get Bot Status
    app.get('/api/status', (req, res) => {
        const activeSessions = [];
        for (const [phone, sock] of sessions.entries()) {
            activeSessions.push(phone);
        }

        res.json({
            status: 'online',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            activeSessionsCount: activeSessions.length,
            activeSessions: activeSessions
        });
    });

    // Endpoint 2: Send Message (Broadcast or DM)
    app.post('/api/message', async (req, res) => {
        const { sessionPhone, to, text } = req.body;
        
        if (!to || !text) {
            return res.status(400).json({ error: 'Missing "to" or "text" in body' });
        }

        let sock;
        if (sessionPhone) {
            sock = sessions.get(sessionPhone);
        } else {
            // Default to the first session if not specified
            sock = sessions.values().next().value;
        }

        if (!sock) {
            return res.status(404).json({ error: 'No active WhatsApp session found to send message' });
        }

        try {
            // Ensure jid formatting
            const jid = to.includes('@s.whatsapp.net') || to.includes('@g.us') ? to : `${to}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text });
            res.json({ success: true, message: 'Message sent successfully!' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.listen(port, () => {
        console.log(`\n🌐 [ADMIN API] Dashboard API is running on port ${port}`);
        console.log(`🔑 [ADMIN API] Your API Key is: ${apiKey}`);
        console.log(`🛡️  Make sure to open port ${port} in your AWS EC2 Security Group!\n`);
    });
}

module.exports = { startAdminApi };
