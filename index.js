const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const P = require('pino');
const { Boom } = require('@hapi/boom');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),

    // 👇 FULL stealth settings
    shouldSendPresence: false,
    markOnlineOnConnect: false
  });

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp (always offline)');
      sock.sendPresenceUpdate('unavailable'); // Stay offline after connect
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Please re-scan QR.');
      } else {
        console.log('🔁 Reconnecting...');
        startBot();
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const msg = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const from = m.key.remoteJid;

    if (msg.toLowerCase() === '!ping') {
      try {
        // Send message silently
        await sock.sendMessage(from, { text: 'pong!' });

        // Immediately set status offline again
        await sock.sendPresenceUpdate('unavailable');
      } catch (err) {
        console.log('⚠️ Error sending message:', err);
      }
    }
  });

  // Prevent auto-acknowledgement + hide presence activity
  sock.ev.on('message-receipt.update', async () => {});
  sock.ev.on('messages.update', async () => {});
  sock.ev.on('presence.update', async () => {});
  sock.ev.on('chats.update', async () => {});
}

startBot();
