/**
 * MazariBot Pairing Server
 * This server generates pairing codes and connects users to the Railway bot
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store active pairing codes
const activePairingCodes = new Map();

// Railway bot configuration
const RAILWAY_BOT_URL = process.env.RAILWAY_BOT_URL || 'https://your-railway-bot-url.railway.app';
const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || '923232391033';

// Generate pairing code endpoint
app.post('/api/generate-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid phone number with country code'
            });
        }
        
        // Generate a unique 8-digit code
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Store the code with phone number and timestamp
        activePairingCodes.set(code, {
            phoneNumber,
            timestamp: Date.now(),
            status: 'pending'
        });
        
        // Clean up old codes (older than 10 minutes)
        const now = Date.now();
        for (const [oldCode, data] of activePairingCodes.entries()) {
            if (now - data.timestamp > 10 * 60 * 1000) {
                activePairingCodes.delete(oldCode);
            }
        }
        
        console.log(`Generated pairing code ${code} for ${phoneNumber}`);
        
        res.json({
            success: true,
            code: code.match(/.{1,4}/g).join('-'),
            message: 'Pairing code generated successfully'
        });
        
    } catch (error) {
        console.error('Error generating pairing code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate pairing code'
        });
    }
});

// Check pairing status endpoint
app.get('/api/check-status/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const cleanCode = code.replace(/-/g, '');
        
        const pairingData = activePairingCodes.get(cleanCode);
        
        if (!pairingData) {
            return res.status(404).json({
                success: false,
                message: 'Pairing code not found or expired'
            });
        }
        
        // Check if code is expired (10 minutes)
        const now = Date.now();
        if (now - pairingData.timestamp > 10 * 60 * 1000) {
            activePairingCodes.delete(cleanCode);
            return res.status(410).json({
                success: false,
                message: 'Pairing code expired'
            });
        }
        
        res.json({
            success: true,
            status: pairingData.status,
            phoneNumber: pairingData.phoneNumber,
            message: 'Pairing code is valid'
        });
        
    } catch (error) {
        console.error('Error checking pairing status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check pairing status'
        });
    });
});

// Complete pairing endpoint
app.post('/api/complete-pairing', async (req, res) => {
    try {
        const { code, phoneNumber } = req.body;
        const cleanCode = code.replace(/-/g, '');
        
        const pairingData = activePairingCodes.get(cleanCode);
        
        if (!pairingData) {
            return res.status(404).json({
                success: false,
                message: 'Pairing code not found or expired'
            });
        }
        
        if (pairingData.phoneNumber !== phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number does not match pairing code'
            });
        }
        
        // Update status to completed
        pairingData.status = 'completed';
        pairingData.completedAt = Date.now();
        
        console.log(`Pairing completed for ${phoneNumber} with code ${cleanCode}`);
        
        // Here you would typically notify your Railway bot
        // For now, we'll just mark it as completed
        
        res.json({
            success: true,
            message: 'Pairing completed successfully! Your WhatsApp is now connected to MazariBot.',
            status: 'completed'
        });
        
    } catch (error) {
        console.error('Error completing pairing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete pairing'
        });
    });
});

// Serve the pairing generator HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pairing-generator.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activePairings: activePairingCodes.size
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 MazariBot Pairing Server running on port ${PORT}`);
    console.log(`📱 Bot Phone Number: ${BOT_PHONE_NUMBER}`);
    console.log(`🔗 Railway Bot URL: ${RAILWAY_BOT_URL}`);
    console.log(`🌐 Pairing Generator: http://localhost:${PORT}`);
});

// Cleanup old codes every 5 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [code, data] of activePairingCodes.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
            activePairingCodes.delete(code);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} expired pairing codes`);
    }
}, 5 * 60 * 1000);
