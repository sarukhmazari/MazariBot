const fs = require('fs');
const path = require('path');

const statusPath = path.join(__dirname, '../data/smartReply.json');

// Track last reply time per user/chat for cooldown
const lastSmartReplyTime = {};

// Smart Reply Response Pool
const smartReplyPool = {
    greeting_urdu: [
        'Wa Alaikum Assalam 🌸 How are you?',
        'Aslam o Alaikum! Kya haal hai?',
        'Alaikum Assalam! Sab theek?',
        'Wa Alaikum Assalam! Kya chal raha hai?',
        'Assalam o Alaikum 😊 Batao, kya scene hai?',
    ],
    greeting_english: [
        'Hello! 👋 How can I help?',
        'Hi there! 😄 Kya haal hai?',
        'Hey! 👋 What\'s up?',
        'Hello bro! 😊 Sab theek?',
        'Hi! How are you doing?',
    ],
    how_are_you: [
        'Alhamdulillah, theek hun! 😊 Tu kaisa hai?',
        'Badhiya hun! Tum batao? 😄',
        'All good! Kya haal hai tum ka?',
        'Sab khairiyat! Aap theek ho?',
        'Bilkul theek hun! Tu kya bol raha hai?',
    ]
};

// Get random response from pool
function getRandomReply(category) {
    const replies = smartReplyPool[category] || [];
    return replies[Math.floor(Math.random() * replies.length)] || '';
}

// Check if message is a greeting (fuzzy matching)
function isGreetingMessage(text) {
    // Convert to lowercase and trim
    const cleanText = text.toLowerCase().trim();
    
    // Urdu/Pakistani style greetings - use flexible matching
    const urduGreetings = [
        'aoa', 'assalam', 'aslam', 'slam', 'salam', 'alaikum', 'alikum',
        'walaikum', 'wa alaikum', 'assalamo alaikum', 'aslamo alaikum'
    ];
    
    // English greetings - use flexible matching
    const englishGreetings = [
        'hi', 'hello', 'hey', 'helo', 'hii', 'helloo', 'hy', 'helo', 'hello!', 'hi!', 'hey!'
    ];
    
    // How are you variations
    const howAreYouPatterns = [
        'kia hal', 'kaisa hal', 'kaise ho', 'kya hal', 'hall', 'haal', 'kaise', 'how are', 'how r u', 'r u ok', 'theek ho'
    ];

    // Check for Urdu greetings using includes (flexible matching)
    for (const greeting of urduGreetings) {
        if (cleanText.includes(greeting)) {
            return 'greeting_urdu';
        }
    }

    // Check for English greetings using includes (flexible matching)
    for (const greeting of englishGreetings) {
        if (cleanText.includes(greeting)) {
            return 'greeting_english';
        }
    }

    // Check for "how are you" patterns
    for (const pattern of howAreYouPatterns) {
        if (cleanText.includes(pattern)) {
            return 'how_are_you';
        }
    }

    return null;
}



// Global smart reply status
let globalSmartReplyEnabled = false;

// Load persisted status on startup
function loadSmartReplyStatus() {
    try {
        if (fs.existsSync(statusPath)) {
            const data = JSON.parse(fs.readFileSync(statusPath));
            globalSmartReplyEnabled = data.enabled === true;
        }
    } catch (e) {
        console.error('Failed to load SmartReply status:', e);
    }
}

// Save status to file
function saveSmartReplyStatus() {
    try {
        const data = { enabled: globalSmartReplyEnabled };
        const dir = path.dirname(statusPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(statusPath, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save SmartReply status:', e);
    }
}

// Initialize
loadSmartReplyStatus();

async function smartreplyCommand(sock, chatId, message, args, senderId, isGroup) {
    const sub = (args[0] || '').toLowerCase();
    
    if (sub === 'on') {
        globalSmartReplyEnabled = true;
        saveSmartReplyStatus();
        await sock.sendMessage(chatId, { text: '✅ *Smart auto-replies enabled for all users!*' }, { quoted: message });
    } else if (sub === 'off') {
        globalSmartReplyEnabled = false;
        saveSmartReplyStatus();
        await sock.sendMessage(chatId, { text: '❌ *Smart auto-replies disabled for all users!*' }, { quoted: message });
    } else if (sub === 'status') {
        const state = globalSmartReplyEnabled ? 'ON ✅' : 'OFF ❌';
        await sock.sendMessage(chatId, { text: `⚙️ SmartReply is currently: ${state}` }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: '❓ Usage:\n.smartreply on (Enable for everyone)\n.smartreply off (Disable for everyone)\n.smartreply status' }, { quoted: message });
    }
}

function getSmartReplyStatus() {
    return globalSmartReplyEnabled;
}

module.exports = { 
    smartreplyCommand, 
    getSmartReplyStatus,
    isGreetingMessage,
    getRandomReply,
    smartReplyPool,
    lastSmartReplyTime
};
