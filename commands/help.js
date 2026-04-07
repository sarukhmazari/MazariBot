const settings = require('../settings');
const os = require('os');
const fs = require('fs');
const { convertMonospace } = require('../lib/myfunc');

async function helpCommand(sock, chatId, message) {
    // Calculate Uptime
    const runtime = process.uptime();
    const hours = Math.floor(runtime / 3600);
    const minutes = Math.floor((runtime % 3600) / 60);
    const seconds = Math.floor(runtime % 60);
    const uptime = `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;

    // Get Bot Mode
    let isPublic = true;
    try {
        if (fs.existsSync('./data/messageCount.json')) {
            const data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof data.isPublic === 'boolean') isPublic = data.isPublic;
        }
    } catch (e) {}
    const mode = isPublic ? 'public' : 'private';

    // Count commands
    const cmdCount = 180; 

    // Construct the menu with the new design
    const helpMessage = `
⌬───────────⏣───────────⌬
     ${settings.botName || '𝙼𝚊𝚣𝚊𝚛𝚒 𝚋𝚘𝚝'}
⌬───────────⏣───────────⌬
⧫ OWNER: ${settings.botOwner || 'MAZARI TEAM'}
⧫ STATUS: ${mode}
⧫ PREFIX: [ . ]
⧫ RUNTIME: ${uptime}
⧫ COMMANDS: ${cmdCount}
⧫ VERSION: ${settings.version || '1.0.0'}
⌬───────────⏣───────────⌬

◈──『 AI COMMANDS 』──◈
⬖ .gpt
⬖ .gemini
⬖ .imagine
⬖ .flux
⬖ .sora

◈──『 OWNER COMMANDS 』──◈
⬖ .mode
⬖ .clearsession
⬖ .update
⬖ .autostatus
⬖ .autoreact
⬖ .autotyping
⬖ .autoread
⬖ .anticall
⬖ .pmblocker

◈──『 GROUP COMMANDS 』──◈
⬖ .kick
⬖ .add
⬖ .ban
⬖ .unban
⬖ .promote
⬖ .demote
⬖ .mute
⬖ .unmute
⬖ .tagall
⬖ .tagadmin
⬖ .hidetag
⬖ .antilink
⬖ .antitag
⬖ .welcome
⬖ .goodbye
⬖ .adminlock
⬖ .custom set
⬖ .custom off
⬖ .custom list
⬖ .autoblock on
⬖ .autoblock off
⬖ .antispam on
⬖ .antispam off

◈──『 DOWNLOADERS 』──◈
⬖ .facebook
⬖ .instagram
⬖ .tiktok
⬖ .twitter
⬖ .threads
⬖ .play
⬖ .song
⬖ .video
⬖ .ytmp4
⬖ .spotify
⬖ .lyrics

◈──『 CONVERTERS 』──◈
⬖ .sticker
⬖ .simage
⬖ .blur
⬖ .remini
⬖ .removebg
⬖ .crop
⬖ .attp
⬖ .emojimix
⬖ .take

◈──『 FUN/GAMES 』──◈
⬖ .tictactoe
⬖ .hangman
⬖ .trivia
⬖ .truth
⬖ .dare
⬖ .meme
⬖ .joke
⬖ .quote
⬖ .compliment
⬖ .insult
⬖ .ship
⬖ .simp
⬖ .stupid

◈──『 UTILITIES 』──◈
⬖ .help
⬖ .ping
⬖ .alive
⬖ .owner
⬖ .repo
⬖ .groupinfo
⬖ .staff
⬖ .jid
⬖ .url
⬖ .dp

⌬───────────⏣───────────⌬
   ✨ Powered by ${settings.botName || '𝙼𝚊𝚣𝚊𝚛𝚒 𝚋𝚘𝚝'} ✨
⌬───────────⏣───────────⌬`.trim();

    // Apply monospace font conversion to the entire compiled string
    const styledHelpMessage = convertMonospace(helpMessage);

    try {
        const dpPath = settings.connectionImagePath || './assets/images/DP.png';
        const musicPath = './assets/musics/MUSIC.mp3';
        let menuMsg;

        if (fs.existsSync(dpPath)) {
            menuMsg = await sock.sendMessage(chatId, {
                image: { url: dpPath },
                caption: styledHelpMessage,
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: message });
        } else {
            menuMsg = await sock.sendMessage(chatId, {
                text: styledHelpMessage,
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: message });
        }

        // Automatic Music Follow-up
        if (fs.existsSync(musicPath)) {
            await sock.sendMessage(chatId, { 
                audio: { url: musicPath }, 
                mimetype: 'audio/mpeg', 
                ptt: false, // Sent as standard audio for maximum playback reliability
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: menuMsg });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: styledHelpMessage }, { quoted: message });
    }
}

module.exports = helpCommand;