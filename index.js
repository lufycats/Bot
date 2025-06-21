const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const P = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'authorized.json');

function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ users: [], groups: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE));
}

function isAuthorized(jid) {
  const auth = loadAuth();
  return jid.endsWith('@g.us') ? auth.groups.includes(jid) : auth.users.includes(jid);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    shouldSendPresence: false,
    getMessage: async () => ({})
  });

  // Force always-offline presence
  const realPresence = sock.sendPresenceUpdate;
  sock.sendPresenceUpdate = async (type, toJid) => {
    if (type === 'unavailable') return await realPresence(type, toJid);
  };

  // Load plugins
  const plugins = new Map();
  const pluginDir = path.join(__dirname, 'plugins');
  if (fs.existsSync(pluginDir)) {
    fs.readdirSync(pluginDir).forEach(file => {
      if (file.endsWith('.js')) {
        const plugin = require(path.join(pluginDir, file));
        if (plugin.name && typeof plugin.execute === 'function') {
          plugins.set(plugin.name, plugin);
          console.log(`✅ Loaded plugin: ${plugin.name}`);
        }
      }
    });
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Connected (stealth mode)');
      sock.sendPresenceUpdate('unavailable');
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Please scan QR again.');
      } else {
        console.log('🔁 Reconnecting...');
        setTimeout(() => startBot(), 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const from = m.key.remoteJid;
    const msg =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      '';

    if (!msg.startsWith('!') && !msg.startsWith('.')) return;

    const [command, ...args] = msg.slice(1).trim().split(/\s+/);

    // Always allow .reg
    if (command === 'reg' && plugins.has('reg')) {
      await plugins.get('reg').execute(sock, from, args);
      await sock.sendPresenceUpdate('unavailable');
      return;
    }

    // Self-test override (allow bot number)
    const selfJid = sock.user?.id;
    const isSelf = from === selfJid;

    if (!isAuthorized(from) && !isSelf) return;

    if (command === 'ping') {
      const start = Date.now();
      await sock.sendMessage(from, { text: 'pong!' });
      const end = Date.now();
      await sock.sendMessage(from, { text: `pong! ${end - start}ms` });
      await sock.sendPresenceUpdate('unavailable');
      return;
    }

    if (plugins.has(command)) {
      try {
        await plugins.get(command).execute(sock, from, args);
        await sock.sendPresenceUpdate('unavailable');
      } catch (err) {
        console.error(`❌ Plugin error (${command}):`, err);
        await sock.sendMessage(from, { text: '⚠️ Plugin failed.' });
        await sock.sendPresenceUpdate('unavailable');
      }
    }
  });

  // Ignore all presence updates (incoming)
  sock.ev.on('presence.update', () => {});
  sock.ev.on('messages.update', () => {});
  sock.ev.on('message-receipt.update', () => {});
}

startBot();
