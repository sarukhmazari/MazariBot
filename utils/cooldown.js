/**
 * Simple in-memory cooldown system per user
 */
const cooldowns = new Map();

/**
 * Check if a user is in cooldown
 * @param {string} userId - Participant's JID
 * @param {string} command - Command name
 * @param {number} duration - Cooldown in milliseconds
 * @returns {object} - { status: boolean, timeLeft: number }
 */
const checkCooldown = (userId, command, duration = 3000) => {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastRequest = cooldowns.get(key) || 0;

    if (now - lastRequest < duration) {
        return {
            status: true,
            timeLeft: Math.ceil((duration - (now - lastRequest)) / 1000)
        };
    }

    // Set new timestamp
    cooldowns.set(key, now);
    return {
        status: false,
        timeLeft: 0
    };
};

module.exports = {
    checkCooldown
};
