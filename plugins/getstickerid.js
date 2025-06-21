module.exports = {
  name: 'getstickerid',
  execute: async (sock, from, args, msg) => {
    const sticker = msg.message?.stickerMessage;
    if (!sticker) {
      await sock.sendMessage(from, { text: '❌ Please send a sticker with .getstickerid' });
      return;
    }

    const fileSha256 = sticker.fileSha256.toString('hex');
    const fileEncSha256 = sticker.fileEncSha256.toString('hex');

    await sock.sendMessage(from, {
      text: `🪪 Sticker ID:\n\n*fileSha256:*\n\`${fileSha256}\`\n\n*fileEncSha256:*\n\`${fileEncSha256}\``
    });
  }
};
