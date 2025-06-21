const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const P = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),

    // 👇 Stealth mode settings
    shouldSendPresence: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    getMessage: async () => ({ conversation: "❌ Blocked read" })
  });

  // 🔄 Auto reconnect
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp (invisible mode)');
      sock.sendPresenceUpdate('unavailable'); // Appear offline
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Scan QR again.');
      } else {
        console.log('🔄 Reconnecting...');
        startBot();
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // 📥 Message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const msg = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const from = m.key.remoteJid;

    // ❌ Prevent double tick: don't send delivery receipt
    // ❌ Prevent blue tick: don't send read receipt

    // ✅ Respond without triggering "typing"
    if (msg.toLowerCase() === '!ping') {
      await sock.sendMessage(from, { text: 'pong!' });
    }
  });

  // ⛔ BLOCK TICKS — override events
  sock.ev.on('messages.update', async () => {});
  sock.ev.on('message-receipt.update', async () => {});
  sock.ev.on('messages.reaction', async () => {});
}

startBot();
