const fs = require('fs');
const path = require('path');

/**
 * Robust Banned User Check
 * Handles missing data/banned.json gracefully
 */
function isBanned(jid) {
  const bannedPath = path.join(process.cwd(), 'data', 'banned.json');
  const dataDir = path.join(process.cwd(), 'data');

  try {
    // 1. Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 [DATA] Created data directory.');
    }

    // 2. Ensure banned.json exists
    if (!fs.existsSync(bannedPath)) {
      fs.writeFileSync(bannedPath, JSON.stringify({}, null, 2));
      console.log('📝 [DATA] Initialized empty banned.json file (Object).');
      return false;
    }

    // 3. Read and parse
    const data = fs.readFileSync(bannedPath, 'utf8');
    const banned = JSON.parse(data);

    // 4. Flexible Check (Handle both Object and Array structures)
    if (Array.isArray(banned)) {
      return banned.includes(jid);
    } else {
      return !!banned[jid];
    }

  } catch (err) {
    // Graceful error handling
    console.warn('⚠️ [WARNING] Banned list check failed:', err.message);
    return false; // Fail open (allow) if check fails, to prevent bot crash
  }
}

module.exports = { isBanned };