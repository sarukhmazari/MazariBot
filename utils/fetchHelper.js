const axios = require('axios');

const isDebug = process.env.DEBUG === 'true';

/**
 * Fetch helper to get JSON response
 */
const fetchJson = async (url, options = {}) => {
    try {
        if (isDebug) console.log(`[Fetch API] Requesting: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            },
            ...options
        });
        if (isDebug) console.log(`[Fetch API] Success: ${url} (${response.status})`);
        return response.data;
    } catch (error) {
        if (isDebug) console.error(`[Fetch API Error] [${url}]:`, error.message);
        return null;
    }
};

/**
 * Fetch helper to get image buffer
 */
const fetchBuffer = async (url) => {
    try {
        if (isDebug) console.log(`[Fetch Buffer] Downloading: ${url}`);
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        });
        const buffer = Buffer.from(response.data, 'binary');
        if (isDebug) console.log(`[Fetch Buffer] Success! Size: ${buffer.length} bytes`);
        return buffer;
    } catch (error) {
        if (isDebug) console.error(`[Fetch Buffer Error] [${url}]:`, error.message);
        return null;
    }
};

module.exports = {
    fetchJson,
    fetchBuffer
};
