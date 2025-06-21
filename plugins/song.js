const ytsr = require('ytsr');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = {
  name: 'song',
  execute: async (sock, from, args) => {
    try {
      const query = args.join(' ');
      if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: .song <name>' });
        return;
      }

      const searchResults = await ytsr(query, { limit: 1 });
      const video = searchResults.items.find(i => i.type === 'video');

      if (!video) {
        await sock.sendMessage(from, { text: '❌ No results found.' });
        return;
      }

      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const audioPath = path.join(tempDir, `${video.id}.mp3`);
      const audioStream = ytdl(video.url, { filter: 'audioonly' });

      await new Promise((resolve, reject) => {
        ffmpeg(audioStream)
          .audioBitrate(128)
          .save(audioPath)
          .on('end', resolve)
          .on('error', reject);
      });

      await sock.sendMessage(from, {
        audio: fs.readFileSync(audioPath),
        mimetype: 'audio/mp4'
      });

      fs.unlinkSync(audioPath); // cleanup

    } catch (err) {
      console.error('[.song ERROR]', err);
      await sock.sendMessage(from, {
        text: `❌ Error downloading song:\n${err.message || 'Unknown error'}`
      });
    }
  }
};
