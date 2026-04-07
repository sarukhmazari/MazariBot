const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');


async function githubCommand(sock, chatId, message) {
  try {
    let txt = `*乂  MAZARI BOT  乂*\n\n`;
    txt += `✩  *Bot Name* : MAZARI BOT\n`;
    txt += `✩  *Owner* : Sarukh Mazari\n`;
    txt += `✩  *Version* : 1.0.0\n`;
    txt += `✩  *Status* : Active\n\n`;
    txt += `💥 *Professional WhatsApp Bot*\n\n`;
    txt += `For source code and updates, contact the bot owner.`;

    // Use the local asset image
    const imgPath = path.join(__dirname, '../assets/bot_image.jpg');

    if (fs.existsSync(imgPath)) {
      const imgBuffer = fs.readFileSync(imgPath);
      await sock.sendMessage(chatId, { image: imgBuffer, caption: txt }, { quoted: message });
    } else {
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
    }
  } catch (error) {
    await sock.sendMessage(chatId, { text: '❌ Error fetching bot information.' }, { quoted: message });
  }
}

module.exports = githubCommand;