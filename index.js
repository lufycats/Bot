const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const P = require('pino');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

// === AUTHORIZATION LOGIC ===
const AUTH_FILE = path.join(__dirname, 'authorized.json');

function loadAuth() {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      fs.writeFileSync(AUTH_FILE, JSON.stringify({ users: [], groups: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(AUTH_FILE));
  } catch (err) {
    console.error('❌ Failed to load authorized.json:', err);
    return { users: [], groups: [] };
  }
}

function isAuthorized(jid) {
  const auth = loadAuth();
  return jid.endsWith('@g.us')
    ? auth.groups.includes(jid)
    : auth.users.includes(jid);
}

// === START BOT ===
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    shouldSendPresence: false,
    markOnlineOnConnect: false
  });

  // Block online/typing
  const realSendPresenceUpdate = sock.sendPresenceUpdate;
  sock.sendPresenceUpdate = async (type, toJid) => {
    if (['available', 'composing', 'recording', 'paused'].includes(type)) return;
    return realSendPresenceUpdate(type, toJid);
  };

  // === LOAD PLUGINS ===
  const plugins = new Map();
  const pluginsPath = path.join(__dirname, 'plugins');
  if (fs.existsSync(pluginsPath)) {
    fs.readdirSync(pluginsPath).forEach(file => {
      if (file.endsWith('.js')) {
        const plugin = require(path.join(pluginsPath, file));
        if (plugin.name && typeof plugin.execute === 'function') {
          plugins.set(plugin.name, plugin);
          console.log(`✅ Loaded plugin: ${plugin.name}`);
        }
      }
    });
  }

  // === CONNECTION EVENTS ===
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Connected (Stealth Mode)');
      sock.sendPresenceUpdate('unavailable');
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Please re-scan QR.');
      } else {
        console.log('🔁 Reconnecting...');
        setTimeout(startBot, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // === MESSAGE HANDLER ===
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const from = m.key.remoteJid;
    const msg =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption || '';

    if (!msg.startsWith('!') && !msg.startsWith('.')) return;

    const [command, ...args] = msg.slice(1).trim().split(/\s+/);
    const selfJid = sock.user?.id;
    const isSelf = from === selfJid;

    // Always allow bot to run commands to itself
    if (!isSelf && !isAuthorized(from)) {
      console.log(`❌ Unauthorized: ${from}`);
      await sock.sendPresenceUpdate('unavailable');
      return;
    }

    // Always allow .reg command
    if (command === 'reg' && plugins.has('reg')) {
      await plugins.get('reg').execute(sock, from, args);
      await sock.sendPresenceUpdate('unavailable');
      return;
    }

    // Run plugins
    if (plugins.has(command)) {
      try {
        await plugins.get(command).execute(sock, from, args);
      } catch (err) {
        console.error(`❌ Plugin failed (${command}):`, err);
        await sock.sendMessage(from, { text: `⚠️ Error in ${command}` });
      } finally {
        await sock.sendPresenceUpdate('unavailable');
      }
    }
  });

  // Silence presence and read events
  sock.ev.on('messages.update', () => {});
  sock.ev.on('message-receipt.update', () => {});
  sock.ev.on('presence.update', () => {});
}

startBot();
