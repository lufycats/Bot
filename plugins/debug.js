module.exports = {
  name: 'debug',
  execute: async (sock, from, args, msg) => {
    console.log('📦 FULL MESSAGE:', JSON.stringify(msg, null, 2));
    await sock.sendMessage(from, { text: '✅ Message logged to console.' });
  }
};
