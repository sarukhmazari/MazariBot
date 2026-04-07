const fs = require('fs');
const path = require('path');

function isBanned(userId) {
    if (!userId) return false;
    const bannedPath = path.join(process.cwd(), 'data', 'banned.json');
    
    try {
        if (!fs.existsSync(bannedPath)) {
            if (!fs.existsSync(path.dirname(bannedPath))) {
                fs.mkdirSync(path.dirname(bannedPath), { recursive: true });
            }
            fs.writeFileSync(bannedPath, '[]', 'utf8');
            return false;
        }
        
        const raw = fs.readFileSync(bannedPath, 'utf8').trim();
        if (!raw) return false;
        
        const bannedUsers = JSON.parse(raw);
        return Array.isArray(bannedUsers) ? bannedUsers.includes(userId) : !!bannedUsers[userId];
    } catch (error) {
        // Use a less verbose warning for corrupted data
        console.warn('⚠️ [INFO] Banned check failed (likely initializing/empty):', error.message);
        return false;
    }
}

module.exports = { isBanned }; 