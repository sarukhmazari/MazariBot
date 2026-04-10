const settings = require('../settings');
const os = require('os');
const fs = require('fs');

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
    const mode = isPublic ? '𝚙𝚞𝚋𝚕𝚒𝚌' : '𝚙𝚛𝚒𝚟𝚊𝚝𝚎';

    // Count commands dynamically from the commands folder
    const cmdCount = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.js') && file !== 'handler.js')
        .length;

    // Construct the menu with the new design
    const helpMessage = `⌬───────────⏣───────────⌬
〔 𝗠𝗔𝗭𝗔𝗥𝗜  𝗔𝗜  𝗕𝗢𝗧 〕
⌬───────────⏣───────────⌬
⧫ 𝙾𝚆𝙽𝙴𝚁: 𝙼𝙰𝚉𝙰𝚁𝙸 𝚃𝙴𝙰𝙼
⧫ 𝚂𝚃𝙰𝚃𝚄𝚂: ${mode}
⧫ 𝙿𝚁𝙴𝙵𝙸𝚇: [ . ]
⧫ 𝚁𝚄𝙽𝚃𝙸𝙼𝙴: ${uptime}
⧫ 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂: ${cmdCount}
⧫ 𝚅𝙴𝚁𝚂𝙸𝙾𝙽: 𝟷.𝟶.𝟶
⌬───────────⏣───────────⌬

◈──『 𝙰𝙸 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 』──◈
⬖ .𝚐𝚙𝚝
⬖ .𝚐𝚎𝚖𝚒𝚗𝚒
⬖ .𝚒𝚖𝚊𝚐𝚒𝚗𝚎
⬖ .𝚏𝚕𝚞𝚡
⬖ .𝚜𝚘𝚛𝚊

◈──『 𝙾𝚆𝙽𝙴𝚁 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 』──◈
⬖ .𝚖𝚘𝚍𝚎
⬖ .𝚌𝚕𝚎𝚊𝚛𝚜𝚎𝚜𝚜𝚒𝚘𝚗
⬖ .𝚞𝚙𝚍𝚊𝚝𝚎
⬖ .𝚊𝚞𝚝𝚘𝚜𝚝𝚊𝚝𝚞𝚜
⬖ .𝚊𝚞𝚝𝚘𝚛𝚎𝚊𝚌𝚝
⬖ .𝚊𝚞𝚝𝚘𝚝𝚢𝚙𝚒𝚗𝚐
⬖ .𝚊𝚞𝚝𝚘𝚛𝚎𝚊𝚍
⬖ .𝚊𝚗𝚝𝚒𝚌𝚊𝚕𝚕
⬖ .𝚙𝚖𝚋𝚕𝚘𝚌𝚔𝚎𝚛

◈──『 𝙶𝚁𝙾𝚄𝙿 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 』──◈
⬖ .𝚔𝚒𝚌𝚔
⬖ .𝚊𝚍𝚍
⬖ .𝚋𝚊𝚗
⬖ .𝚞𝚗𝚋𝚊𝚗
⬖ .𝚙𝚛𝚘𝚖𝚘𝚝𝚎
⬖ .𝚍𝚎𝚖𝚘𝚝𝚎
⬖ .𝚖𝚞𝚝𝚎
⬖ .𝚞𝚗𝚖𝚞𝚝𝚎
⬖ .𝚝𝚊𝚐𝚊𝚕𝚕
⬖ .𝚝𝚊𝚐𝚊𝚍𝚖𝚒𝚗
⬖ .𝚑𝚒𝚍𝚎𝚝𝚊𝚐
⬖ .𝚊𝚗𝚝𝚒𝚕𝚒𝚗𝚔
⬖ .𝚊𝚗𝚝𝚒𝚝𝚊𝚐
⬖ .𝚠𝚎𝚕𝚌𝚘𝚖𝚎
⬖ .𝚐𝚘𝚘𝚍𝚋𝚢𝚎
⬖ .𝚊𝚍𝚖𝚒𝚗𝚕𝚘𝚌𝚔
⬖ .𝚌𝚞𝚜𝚝𝚘𝚖 𝚜𝚎𝚝
⬖ .𝚌𝚞𝚜𝚝𝚘𝚖 𝚘𝚏𝚏
⬖ .𝚌𝚞𝚜𝚝𝚘𝚖 𝚕𝚒𝚜𝚝
⬖ .𝚊𝚞𝚝𝚘𝚋𝚕𝚘𝚌𝚔 𝚘𝚗
⬖ .𝚊𝚞𝚝𝚘𝚋𝚕𝚘𝚌𝚔 𝚘𝚏𝚏
⬖ .𝚊𝚗𝚝𝚒𝚜𝚙𝚊𝚖 𝚘𝚗
⬖ .𝚊𝚗𝚝𝚒𝚜𝚙𝚊𝚖 𝚘𝚏𝚏

◈──『 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁𝚂 』──◈
⬖ .𝚏𝚊𝚌𝚎𝚋𝚘𝚘𝚔
⬖ .𝚒𝚗𝚜𝚝𝚊𝚐𝚛𝚊𝚖
⬖ .𝚝𝚒𝚔𝚝𝚘𝚔
⬖ .𝚝𝚠𝚒𝚝𝚝𝚎𝚛
⬖ .𝚝𝚑𝚛𝚎𝚊𝚍𝚜
⬖ .𝚙𝚕𝚊𝚢
⬖ .𝚜𝚘𝚗𝚐
⬖ .𝚟𝚒𝚍𝚎𝚘
⬖ .𝚢𝚝𝚖𝚙𝟺
⬖ .𝚜𝚙𝚘𝚝𝚒𝚏𝚢
⬖ .𝚕𝚢𝚛𝚒𝚌𝚜

◈──『 𝙲𝙾𝙽𝚅𝙴𝚁𝚃𝙴𝚁𝚂 』──◈
⬖ .𝚜𝚝𝚒𝚌𝚔𝚎𝚛
⬖ .𝚜𝚒𝚖𝚊𝚐𝚎
⬖ .𝚋𝚕𝚞𝚛
⬖ .𝚛𝚎𝚖𝚒𝚗𝚒
⬖ .𝚛𝚎𝚖𝚘𝚟𝚎𝚋𝚐
⬖ .𝚌𝚛𝚘𝚙
⬖ .𝚊𝚝𝚝𝚙
⬖ .𝚎𝚖𝚘𝚓𝚒𝚖𝚒𝚡
⬖ .𝚝𝚊𝚔𝚎

◈──『 𝙵𝚄𝙽/𝙶𝙰𝙼𝙴𝚂 』──◈
⬖ .𝚝𝚒𝚌𝚝𝚊𝚌𝚝𝚘𝚎
⬖ .𝚑𝚊𝚗𝚐𝚖𝚊𝚗
⬖ .𝚝𝚛𝚒𝚟𝚒𝚊
⬖ .𝚝𝚛𝚞𝚝𝚑
⬖ .𝚍𝚊𝚛𝚎
⬖ .𝚖𝚎𝚖𝚎
⬖ .𝚓𝚘𝚔𝚎
⬖ .𝚚𝚞𝚘𝚝𝚎
⬖ .𝚌𝚘𝚖𝚙𝚕𝚒𝚖𝚎𝚗𝚝
⬖ .𝚒𝚗𝚜𝚞𝚕𝚝
⬖ .𝚜𝚑𝚒𝚙
⬖ .𝚜𝚒𝚖𝚙
⬖ .𝚜𝚝𝚞𝚙𝚒𝚍

◈──『 𝚄𝚃𝙸𝙻𝙸𝚃𝙸𝙴𝚂 』──◈
⬖ .𝚑𝚎𝚕𝚙
⬖ .𝚙𝚒𝚗𝚐
⬖ .𝚊𝚕𝚒𝚟𝚎
⬖ .𝚘𝚠𝚗𝚎𝚛
⬖ .𝚛𝚎𝚙𝚘
⬖ .𝚐𝚛𝚘𝚞𝚙𝚒𝚗𝚏𝚘
⬖ .𝚜𝚝𝚊𝚏𝚏
⬖ .𝚓𝚒𝚍
⬖ .𝚞𝚛𝚕
⬖ .𝚍𝚙

⌬───────────⏣───────────⌬
✨ 𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 〔 𝗠𝗔𝗭𝗔𝗥𝗜  ＡＩ  𝗕𝗢𝗧 〕 ✨
⌬───────────⏣───────────⌬`;

    const imageCandidates = [
        settings.connectionImagePath,
        './assets/DP.jpg',
        './assets/images/DP.jpg'
    ].filter(Boolean);
    const audioCandidates = [
        './assets/musics/MUSIC.mp3',
        './assets/audio.mp3',
        './assets/audio.mpeg'
    ];

    const dpPath = imageCandidates.find(p => p && fs.existsSync(p));
    const musicPath = audioCandidates.find(p => fs.existsSync(p));

    try {
        let menuMsg;

        if (dpPath) {
            menuMsg = await sock.sendMessage(chatId, {
                image: fs.readFileSync(dpPath),
                caption: helpMessage,
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: message });
        } else {
            menuMsg = await sock.sendMessage(chatId, {
                text: helpMessage,
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: message });
        }

        if (musicPath) {
            await sock.sendMessage(chatId, {
                audio: fs.readFileSync(musicPath),
                mimetype: 'audio/mpeg',
                ptt: false,
                contextInfo: global.promotionInfo?.contextInfo
            }, { quoted: menuMsg });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: message });
    }
}

module.exports = helpCommand;