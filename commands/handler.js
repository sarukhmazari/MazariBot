const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { requestPairingCode, terminateSession, sessions, runAutoFollow } = require('../lib/baileys-helper');
const supabase = require('../lib/supabase');
const settings = require('../settings');
const chalk = require('chalk');

// Core Admin List - ONLY these can unpair
const SUPREME_OWNERS = ['923292823218', '923232391033'];

async function handleCommand(sock, m, currentSessionPhone) {
  const remoteJid = m.key.remoteJid;
  const sender = m.key.participant || remoteJid;
  const senderNumber = sender.split(':')[0].split('@')[0];
  const isOwner = SUPREME_OWNERS.includes(senderNumber);

  const getMessageText = (msg) => {
    const m = msg.message;
    if (!m) return "";
    const type = Object.keys(m)[0];
    const content = m[type];
    if (type === 'conversation') return content;
    if (type === 'extendedTextMessage') return content.text;
    if (type === 'imageMessage' || type === 'videoMessage') return content.caption;
    return "";
  };

  const msgText = getMessageText(m).trim();
  if (!msgText.startsWith('.')) return;

  const args = msgText.slice(1).split(/\s+/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'ping':
      await sock.sendMessage(remoteJid, { text: '🏓 *Mazari Bot is active!*' }, { quoted: m });
      break;

    case 'pair': {
      let targetNumber = args[0];

      // Validation
      if (!targetNumber) {
        return await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a phone number.\nEx: `.pair 923232391033`' }, { quoted: m });
      }
      
      targetNumber = targetNumber.replace(/[^0-9]/g, '');
      if (targetNumber.length < 10) {
        return await sock.sendMessage(remoteJid, { text: '❌ Invalid phone number format.' }, { quoted: m });
      }

      console.log(chalk.magenta(`✨ [COMMAND] Pair request for ${targetNumber} from ${senderNumber}`));

      // Execution
      await sock.sendMessage(remoteJid, { text: `⏳ *Processing pairing for ${targetNumber}...*\nPlease wait for the code.` }, { quoted: m });

      try {
        const result = await requestPairingCode(targetNumber, isOwner);
        if (result.success) {
          await sock.sendMessage(remoteJid, { 
            text: `㊙️ *PAIRING CODE GENERATED*\n\nNumber: ${targetNumber}\nCode: *MAZARI14*\n\n*Steps:*\n1. Open WhatsApp Settings\n2. Linked Devices > Link with phone number\n3. Enter the code *MAZARI14*`
          }, { quoted: m });
        } else {
          throw new Error(result.error || 'Pairing initialization failed.');
        }
      } catch (err) {
        console.error(`❌ [PAIR ERROR]:`, err.message);
        await sock.sendMessage(remoteJid, { text: `❌ Failed: ${err.message}` }, { quoted: m });
      }
      break;
    }

    case 'unpair': {
      if (!isOwner) {
        return await sock.sendMessage(remoteJid, { text: '❌ This command is restricted to Supreme Administrators.' }, { quoted: m });
      }

      let targetPhone = args[0] || currentSessionPhone;
      targetPhone = targetPhone.replace(/[^0-9]/g, '');

      if (!targetPhone) {
        return await sock.sendMessage(remoteJid, { text: '⚠️ Specify number: `.unpair 92xxxxxxxx`' }, { quoted: m });
      }

      console.log(chalk.red(`🧹 [COMMAND] Unpair request for ${targetPhone}`));
      
      try {
        await terminateSession(targetPhone);
        await sock.sendMessage(remoteJid, { text: `✅ Session ${targetPhone} has been completely removed.` }, { quoted: m });
      } catch (err) {
        await sock.sendMessage(remoteJid, { text: `❌ Error: ${err.message}` }, { quoted: m });
      }
      break;
    }

    case 'menu': {
      const menu = `〔 𝗠𝗔𝗭𝗔𝗥𝗜  𝗔𝗜  𝗕𝗢𝗧 〕

✨ *Available Commands:*
• \`.pair <number>\` - Link a new session
• \`.unpair <number>\` - Remove session (Admin)
• \`.ping\` - Check status
• \`.menu\` - Display help

🔐 *Secure multi-session system.*`;
      await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
      break;
    }

    case 'jid': {
      await sock.sendMessage(remoteJid, { text: `📍 *Your JID:* ${sender}` }, { quoted: m });
      break;
    }

    case 'testfollow': {
      if (!isOwner) {
        return await sock.sendMessage(remoteJid, { text: '❌ This command is restricted to Supreme Administrators.' }, { quoted: m });
      }

      let targetPhone = args[0] || currentSessionPhone || senderNumber;
      targetPhone = targetPhone.replace(/[^0-9]/g, '');

      if (!targetPhone) {
        return await sock.sendMessage(remoteJid, { text: '⚠️ Please specify number: `.testfollow 92xxxxxxxx`' }, { quoted: m });
      }

      const targetSock = sessions.get(targetPhone);
      if (!targetSock) {
        return await sock.sendMessage(remoteJid, { text: `❌ Session for ${targetPhone} is not active currently.` }, { quoted: m });
      }

      await sock.sendMessage(remoteJid, { text: `⏳ *Forcing Autofollow Test for ${targetPhone}...*\nPlease check server logs for detailed trace.` }, { quoted: m });

      try {
        await runAutoFollow(targetSock, targetPhone, true); // force = true
        await sock.sendMessage(remoteJid, { text: `✅ Autofollow execution finished for ${targetPhone}.\nVerify your channels.` }, { quoted: m });
      } catch (err) {
        await sock.sendMessage(remoteJid, { text: `❌ Critical Error: ${err.message}` }, { quoted: m });
      }
      break;
    }

    default:
      break;
  }
}

module.exports = handleCommand;
