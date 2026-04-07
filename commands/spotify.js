const yts = require('yt-search');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function downloadSong(url, outputFile) {
    return new Promise((resolve, reject) => {
        const exePath = path.join(process.cwd(), 'yt-dlp.exe');
        const ffmpegPath = process.cwd();
        const cmd = `"${exePath}" -x --audio-format mp3 --ffmpeg-location "${ffmpegPath}" --js-runtimes node -o "${outputFile}" "${url}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('yt-dlp error:', error);
                return reject(error);
            }
            resolve(outputFile);
        });
    });
}

async function spotifyCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            return await sock.sendMessage(chatId, {
                text: "Specify a spotify track to download!"
            });
        }

        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, {
                text: "No track found!"
            });
        }

        await sock.sendMessage(chatId, {
            text: "_Fetching spotify track..._"
        });

        const video = videos[0];

        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFile = path.join(tempDir, `${Date.now()}_spotify.mp3`);

        try {
            await downloadSong(video.url, tempFile);

            await sock.sendMessage(chatId, {
                audio: { url: tempFile },
                mimetype: "audio/mpeg",
                fileName: `${video.title}.mp3`
            }, { quoted: message });

            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (err) {
            console.error("Failed sending audio:", err);
            await sock.sendMessage(chatId, {
                text: "Track download failed."
            });
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        }

    } catch (error) {
        console.error('Error in spotify command:', error);
        await sock.sendMessage(chatId, {
            text: "Processing failed."
        });
    }
}

module.exports = spotifyCommand;
