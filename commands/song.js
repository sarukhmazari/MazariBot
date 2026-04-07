const yts = require('yt-search');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

async function songCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            await sock.sendMessage(chatId, { text: 'Usage: .song <song name or YouTube link>' }, { quoted: message });
            return;
        }

        let video;
        try {
            const search = await yts(query);
            if (!search || !search.videos.length) {
                return await sock.sendMessage(chatId, { text: 'No results found.' }, { quoted: message });
            }
            video = search.videos[0];
        } catch (e) {
            return await sock.sendMessage(chatId, { text: 'Invalid YouTube link or video not found.' }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            image: { url: video.thumbnail || 'https://i.imgur.com/kSroM11.png' },
            caption: `🎵 Fetching: *${video.title}*\n⏱ Duration: ${video.timestamp}\n\n_Please wait, downloading and converting to high quality MP3..._`
        }, { quoted: message });

        let audioUrl = null;
        let localFilePath = null;

        try {
            // Priority 1: Use local yt-dlp.exe with ffmpeg (Most robust & compatible)
            const ytDlpPath = path.join(process.cwd(), 'yt-dlp.exe');
            const ffmpegPath = path.join(process.cwd(), 'ffmpeg.exe');

            if (fs.existsSync(ytDlpPath)) {
                try {
                    const tempDir = path.join(process.cwd(), 'temp');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                    const fileName = `${Date.now()}.mp3`;
                    localFilePath = path.join(tempDir, fileName);

                    // Sanitize the filename for WhatsApp message metadata
                    const safeTitle = video.title.replace(/[^\w\s]/gi, '').slice(0, 50);

                    // Download and convert to MP3 using local tools
                    // --ffmpeg-location tells yt-dlp where to find our ffmpeg.exe
                    const conversionCmd = fs.existsSync(ffmpegPath)
                        ? `"${ytDlpPath}" -x --audio-format mp3 --ffmpeg-location "${ffmpegPath}" -o "${localFilePath}" "${video.url}"`
                        : `"${ytDlpPath}" -f "bestaudio[ext=m4a]" -o "${localFilePath}" "${video.url}"`;

                    await execPromise(conversionCmd);

                    if (fs.existsSync(localFilePath)) {
                        const stats = fs.statSync(localFilePath);
                        if (stats.size > 0) {
                            await sock.sendMessage(chatId, {
                                audio: { url: localFilePath },
                                mimetype: 'audio/mpeg',
                                fileName: `${safeTitle}.mp3`,
                                ptt: false
                            }, { quoted: message });

                            // Clean up
                            return fs.unlinkSync(localFilePath);
                        }
                    }
                } catch (e) {
                    console.error('yt-dlp conversion failed:', e.message);
                    if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                }
            }

            // Priority 2: Try APIs as fallback
            const encodedUrl = encodeURIComponent(video.url);

            // Try Akuari API
            try {
                const res = await axios.get(`https://api.akuari.my.id/downloader/youtube?link=${encodedUrl}`);
                if (res.data && res.data.status === true && res.data.dl_link && res.data.dl_link.mp3) {
                    audioUrl = res.data.dl_link.mp3;
                }
            } catch (e) {
                console.error('Akuari API fallback failed:', e.message);
            }

            if (audioUrl) {
                await sock.sendMessage(chatId, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${video.title.replace(/[^\w\s]/gi, '')}.mp3`,
                    ptt: false
                }, { quoted: message });
                return;
            }

            throw new Error("Failed to get audio from all available sources.");

        } catch (err) {
            console.error('Download process failed:', err);
            await sock.sendMessage(chatId, { text: "❌ All download sources failed. YouTube is currently blocking the request. Please try again later." }, { quoted: message });
        }

    } catch (err) {
        console.error('Song command internal error:', err);
        await sock.sendMessage(chatId, { text: '❌ Failed to process the request due to an internal error.' }, { quoted: message });
    }
}

module.exports = songCommand;