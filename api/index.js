const { app } = require('../server');

module.exports = (req, res) => {
    try {
        return app(req, res);
    } catch (err) {
        console.error('Serverless Function Handler Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
        }
    }
};
