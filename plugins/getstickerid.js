module.exports = {
  name: 'getstickerid',
  execute: async (sock, from, args, msg) => {
    const stickerMsg =
      msg.message?.stickerMessage ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;

    if (!stickerMsg) {
      await sock.sendMessage(from, { text: '❌ Please send a sticker or reply to a sticker with .getstickerid' });
      return;
    }

    const fileSha256 = stickerMsg.fileSha256?.toString('hex') || 'N/A';
    const fileEncSha256 = stickerMsg.fileEncSha256?.toString('hex') || 'N/A';

    await sock.sendMessage(from, {
      text: `🪪 Sticker ID:\n\n*fileSha256:*\n\`${fileSha256}\`\n\n*fileEncSha256:*\n\`${fileEncSha256}\``
    });
  }
};
