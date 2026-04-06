const axios = require('axios');

/**
 * Helper to fetch data efficiently
 * @param {string} url 
 * @param {object} options 
 */
async function fetchJson(url, options = {}) {
  try {
    const res = await axios({
      method: 'GET',
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
      },
      ...options
    });
    return res.data;
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err.message);
    return null;
  }
}

module.exports = { fetchJson };
