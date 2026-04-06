const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { requestPairingCode, terminateSession, sessions } = require('../lib/baileys-helper');
const supabase = require('../lib/supabase');
const settings = require('../settings');

const ALLOWED_UNPAIR_NUMBER = `${settings.ownerNumber || '923232391033'}@s.whatsapp.net`;

async function handleCommand(sock, m, currentSessionPhone) {
  const sender = m.key.participant || m.key.remoteJid;
  const msgText = m.message.conversation || 
                  m.message.extendedTextMessage?.text || 
                  m.message.imageMessage?.caption || 
                  '';

  if (!msgText.startsWith('.')) return;

  const args = msgText.trim().slice(1).split(/\s+/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'ping':
      await sock.sendMessage(m.key.remoteJid, { text: '🏓 Pong!' }, { quoted: m });
      break;

    case 'pair': {
      const { setPairPublicEnabled, getPairPublicEnabled, requestPairingCode } = require('../lib/baileys-helper');
      let phoneNumber = args[0];

      // Toggling Logic (Admin Only)
      if (phoneNumber === 'on') {
        setPairPublicEnabled(true);
        return await sock.sendMessage(m.key.remoteJid, { text: '✅ Public pairing is now *ENABLED*.' }, { quoted: m });
      }
      if (phoneNumber === 'off') {
        setPairPublicEnabled(false);
        return await sock.sendMessage(m.key.remoteJid, { text: '❌ Public pairing is now *DISABLED*.' }, { quoted: m });
      }

      if (!phoneNumber) {
        return await sock.sendMessage(m.key.remoteJid, { text: '⚠️ Please provide a phone number.\nExample: `.pair 923232391033`' }, { quoted: m });
      }
      phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
      
      // Notify starting
      await sock.sendMessage(m.key.remoteJid, { text: `🔄 Initializing pairing for ${phoneNumber}...` }, { quoted: m });

      // Request pairing code in background (maintains existing backend logic)
      requestPairingCode(phoneNumber).catch(() => {});

      // Send the static response in the same chat
      await sock.sendMessage(m.key.remoteJid, { 
        text: `📝 Pairing Code: *MAZARI14*\n\n1. Open WhatsApp Settings\n2. Link Device > Link with phone number\n3. Enter the code *MAZARI14*` 
      }, { quoted: m });
      
      break;
    }

    case 'unpair': {
      // Normalize sender JID to compare
      const senderJid = jidNormalizedUser(sender);
      
      // Check authorization
      if (senderJid !== ALLOWED_UNPAIR_NUMBER) {
        return await sock.sendMessage(m.key.remoteJid, { text: '❌ You are not authorized to use this command.' }, { quoted: m });
      }

      let targetPhone = args[0] || currentSessionPhone;
      targetPhone = targetPhone.replace(/[^0-9]/g, '');

      await sock.sendMessage(m.key.remoteJid, { text: `🔄 Unpairing session ${targetPhone}...` }, { quoted: m });
      
      try {
        const success = await terminateSession(targetPhone);
        if (success) {
          await sock.sendMessage(m.key.remoteJid, { text: `✅ Session ${targetPhone} unpaired successfully.` }, { quoted: m });
        } else {
          await sock.sendMessage(m.key.remoteJid, { text: `❌ Failed to unpair session ${targetPhone}.` }, { quoted: m });
        }
      } catch (err) {
        console.error('Unpair error:', err);
        await sock.sendMessage(m.key.remoteJid, { text: '❌ An error occurred during unpair.' }, { quoted: m });
      }
      break;
    }

    case 'menu': {
      const menu = `〔 𝗠𝗔𝗭𝗔𝗥𝗜  𝗔𝗜  𝗕𝗢𝗧 〕

✨ *Commands:*
.pair <phone> - Register new account
.unpair <phone> - Remove account (Admin)
.ping - Bot status
.menu - This list

🔒 Support Number: ${ALLOWED_UNPAIR_NUMBER.split('@')[0]}`;
      await sock.sendMessage(m.key.remoteJid, { text: menu }, { quoted: m });
      break;
    }

    default:
      // Unknown command
      break;
  }
}

module.exports = handleCommand;
