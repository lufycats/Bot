const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'video',
  execute: async (sock, from, args) => {
    try {
      const url = args[0];
      if (!url || !ytdl.validateURL(url)) {
        await sock.sendMessage(from, { text: '❌ Usage: .video <YouTube URL>' });
        return;
      }

      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const videoPath = path.join(tempDir, `${title}.mp4`);
      const stream = ytdl(url, { quality: '18' });

      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(videoPath);
        stream.pipe(fileStream);
        fileStream.on('finish', resolve);
        stream.on('error', reject);
      });

      await sock.sendMessage(from, {
        video: fs.readFileSync(videoPath),
        mimetype: 'video/mp4'
      });

      fs.unlinkSync(videoPath); // cleanup

    } catch (err) {
      console.error('[.video ERROR]', err);
      await sock.sendMessage(from, {
        text: `❌ Error downloading video:\n${err.message || 'Unknown error'}`
      });
    }
  }
};
