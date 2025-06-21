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
  const authData = loadAuth();
  if (jid.endsWith('@g.us')) {
    return authData.groups.includes(jid);
  } else {
    return authData.users.includes(jid);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true, // false on Railway after auth_info saved
    logger: P({ level: 'silent' }),

    // Stealth mode: no online, no typing
    shouldSendPresence: false,
    markOnlineOnConnect: false,
  });

  const realSendPresenceUpdate = sock.sendPresenceUpdate;
  sock.sendPresenceUpdate = async (type, toJid) => {
    // Only send 'unavailable' presence, block others
    if (type !== 'unavailable') return;
    return realSendPresenceUpdate(type, toJid);
  };

  // Load plugins
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

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Connected in invisible mode');
      sock.sendPresenceUpdate('unavailable').catch(() => {});
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Please scan QR again.');
      } else {
        console.log('🔁 Reconnecting in 5 seconds...');
        setTimeout(() => startBot(), 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const from = m.key.remoteJid;
    const msg = m.message.conversation || m.message.extendedTextMessage?.text || '';

    if (!msg.startsWith('!')) return;

    const [command, ...args] = msg.slice(1).trim().split(/\s+/);

    // Allow anyone to run '.reg' to register
    if (command === 'reg') {
      if (plugins.has('reg')) {
        try {
          await plugins.get('reg').execute(sock, from, args);
          await sock.sendPresenceUpdate('unavailable').catch(() => {});
        } catch (err) {
          console.error('Error running reg plugin:', err);
        }
      }
      return; // Skip other commands for reg
    }

    // Authorization check for other commands
    if (!isAuthorized(from)) {
      // silently ignore unauthorized
      return;
    }

    if (command === 'ping') {
      const start = Date.now();
      await sock.sendMessage(from, { text: 'pong!' });
      await sock.sendPresenceUpdate('unavailable').catch(() => {});
      const end = Date.now();
      const ping = end - start;
      await sock.sendMessage(from, { text: `pong! ${ping} ms` });
      await sock.sendPresenceUpdate('unavailable').catch(() => {});
      return;
    }

    if (plugins.has(command)) {
      try {
        await plugins.get(command).execute(sock, from, args);
        await sock.sendPresenceUpdate('unavailable').catch(() => {});
      } catch (err) {
        console.error(`Error running plugin ${command}:`, err);
        await sock.sendMessage(from, { text: `⚠️ Error executing command: ${command}` });
      }
    }
  });

  // Silence events that cause presence/read receipts
  sock.ev.on('messages.update', () => {});
  sock.ev.on('message-receipt.update', () => {});
  sock.ev.on('presence.update', () => {});
}

startBot();
