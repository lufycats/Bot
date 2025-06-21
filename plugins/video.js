const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'video',
  execute: async (sock, from, args) => {
    const url = args[0];
    if (!url || !ytdl.validateURL(url)) {
      await sock.sendMessage(from, { text: '❌ Usage: .video <youtube-url>' });
      return;
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const fileName = title.replace(/[^\w\s]/gi, '') + '.mp4';
    const filePath = path.join(__dirname, `../temp/${fileName}`);

    await new Promise((resolve, reject) => {
      ytdl(url, { quality: '18' })
        .pipe(fs.createWriteStream(filePath))
        .on('finish', resolve)
        .on('error', reject);
    });

    await sock.sendMessage(from, {
      video: fs.readFileSync(filePath),
      mimetype: 'video/mp4',
      caption: title
    });

    fs.unlinkSync(filePath); // cleanup
  }
};
