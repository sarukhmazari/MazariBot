const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        platform: 'vercel',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/pair', async (req, res) => {
    try {
        const rawPhone = req.body.phone || req.body.phoneNumber || '';
        const phoneNumber = String(rawPhone).replace(/[^0-9]/g, '').trim();

        if (!phoneNumber || phoneNumber.length < 10 || phoneNumber.length > 15) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid phone number with country code.'
            });
        }

        // Generate pairing code via Baileys helper safely
        const { requestPairingCode, pairingCodesStore, sessionStates } = require('../lib/baileys-helper');
        await requestPairingCode(phoneNumber, false);

        let realCode = null;
        for (let i = 0; i < 15; i++) {
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
        } else {
            return res.status(504).json({
                success: false,
                error: 'Timed out waiting for WhatsApp pairing code. Please ensure bot worker is running.'
            });
        }
    } catch (err) {
        console.error('Pairing error in Vercel:', err);
        return res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
});

app.get('/api/pair/status/:phone', async (req, res) => {
    const phoneNumber = String(req.params.phone).replace(/[^0-9]/g, '').trim();
    try {
        const { sessionStates } = require('../lib/baileys-helper');
        const state = (sessionStates && sessionStates.get(phoneNumber)) || 'IDLE';
        res.json({ success: true, phoneNumber, state, isConnected: state === 'CONNECTED' });
    } catch (e) {
        res.json({ success: true, phoneNumber, state: 'IDLE', isConnected: false });
    }
});

module.exports = app;
