const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.ADMIN_PORT || 3000;
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files with no-cache headers
const frontendPath = path.join(__dirname, 'frontend');
const publicPath = path.join(__dirname, 'public');

if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath, { etag: false, maxAge: 0 }));
}
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath, { etag: false, maxAge: 0 }));
}

/**
 * Healthcheck API
 */
app.get('/api/health', (req, res) => {
    let activeSessionsCount = 0;
    let totalSessions = 0;
    try {
        const { sessionStates } = require('./lib/baileys-helper');
        if (sessionStates) {
            for (const [phone, state] of sessionStates.entries()) {
                if (state === 'CONNECTED') activeSessionsCount++;
            }
            totalSessions = sessionStates.size;
        }
    } catch (e) {
        // Fallback gracefully in serverless
    }

    res.json({
        success: true,
        status: 'online',
        platform: isServerless ? 'vercel' : 'node',
        activeSessions: activeSessionsCount,
        totalSessions: totalSessions,
        timestamp: new Date().toISOString()
    });
});

/**
 * Request Pairing Code API
 * Body: { phone: "923232391033" }
 */
app.post('/api/pair', async (req, res) => {
    try {
        const { requestPairingCode, pairingCodesStore, sessionStates } = require('./lib/baileys-helper');
        const rawPhone = req.body.phone || req.body.phoneNumber || '';
        const phoneNumber = String(rawPhone).replace(/[^0-9]/g, '').trim();

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid phone number with country code.'
            });
        }

        if (phoneNumber.length < 10 || phoneNumber.length > 15) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number length. Must be 10-15 digits including country code.'
            });
        }

        // Check if already connected
        if (sessionStates && sessionStates.get(phoneNumber) === 'CONNECTED') {
            return res.json({
                success: true,
                alreadyConnected: true,
                message: `Phone number +${phoneNumber} is already active and connected!`,
                phoneNumber
            });
        }

        // Reset any existing code for this number
        if (pairingCodesStore) pairingCodesStore.delete(phoneNumber);

        // Initiate Baileys session & request pairing code
        await requestPairingCode(phoneNumber, false);

        // Poll for pairing code with timeout (up to 20 seconds)
        let realCode = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (pairingCodesStore) realCode = pairingCodesStore.get(phoneNumber);
            if (realCode || (sessionStates && sessionStates.get(phoneNumber) === 'CONNECTED')) break;
        }

        if (realCode) {
            return res.json({
                success: true,
                code: realCode,
                phoneNumber,
                expiresInSeconds: 120,
                message: 'Pairing code generated successfully.'
            });
        } else if (sessionStates && sessionStates.get(phoneNumber) === 'CONNECTED') {
            return res.json({
                success: true,
                alreadyConnected: true,
                phoneNumber,
                message: `Phone number +${phoneNumber} is successfully connected!`
            });
        } else {
            return res.status(504).json({
                success: false,
                error: 'Timed out waiting for WhatsApp pairing code. Please verify your number and try again.'
            });
        }

    } catch (error) {
        console.error('API /api/pair error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'An unexpected error occurred while generating pairing code.'
        });
    }
});

/**
 * Check Pairing / Connection Status
 * GET /api/pair/status/:phone
 */
app.get('/api/pair/status/:phone', async (req, res) => {
    try {
        const { sessionStates } = require('./lib/baileys-helper');
        const phoneNumber = String(req.params.phone).replace(/[^0-9]/g, '').trim();
        const state = (sessionStates && sessionStates.get(phoneNumber)) || 'IDLE';
        const isConnected = state === 'CONNECTED';

        res.json({
            success: true,
            phoneNumber,
            state,
            isConnected
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Fallback to index.html for single page app
app.use((req, res) => {
    let indexPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'public', 'index.html');
    }
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'frontend', 'index.html');
    }
    res.sendFile(indexPath);
});

/**
 * Start the Web Server
 */
function startWebServer(port = PORT) {
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.log(`🌐 [WEB PORTAL] Live at: http://localhost:${port}`);
            resolve(server);
        });
    });
}

// Allow direct execution: node server.js (prevent auto-listen in serverless)
if (require.main === module && !isServerless) {
    startWebServer();
}

module.exports = { app, startWebServer };
