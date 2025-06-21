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

// === 🔐 Load authorized users & groups ===
const AUTH_FILE = path.join(__dirname, 'authorized.json');
let authData = { users: [], groups: [] };

if (fs.existsSync(AUTH_FILE)) {
  authData = JSON.parse(fs.readFileSync(AUTH_FILE));
} else {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
}

function saveAuthData() {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
}

function isAuthorized(jid) {
  return jid.endsWith('@g.us')
    ? authData.groups.includes(jid)
    : authData.users.includes(jid);
}

// === 🧩 Load Plugins ===
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

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),
    shouldSendPresence: false,
    markOnlineOnConnect: false,
  });

  // 👻 Stealth Mode (force offline presence always)
  const realSendPresenceUpdate = sock.sendPresenceUpdate;
  sock.sendPresenceUpdate = async (type, toJid) => {
    if (['available', 'composing', 'recording', 'paused'].includes(type)) return;
    return realSendPresenceUpdate(type, toJid);
  };
  setInterval(() => {
    sock.sendPresenceUpdate('unavailable');
  }, 15000);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Connected in invisible mode');
      sock.sendPresenceUpdate('unavailable');
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Scan QR again.');
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

    const from = m.key.remoteJid;
    const msg = m.message.conversation || m.message.extendedTextMessage?.text || '';
    if (!msg.startsWith('.') && !msg.startsWith('!')) return;

    const [rawCommand, ...args] = msg.slice(1).trim().split(/\s+/);
    const command = rawCommand.toLowerCase();

    // === 🔐 Registration
    if (command === 'reg' && args[0]) {
      const jidToAdd = args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net';
      if (jidToAdd.endsWith('@g.us')) {
        if (!authData.groups.includes(jidToAdd)) {
          authData.groups.push(jidToAdd);
          saveAuthData();
          await sock.sendMessage(from, { text: `✅ Registered group: ${jidToAdd}` });
        }
      } else {
        if (!authData.users.includes(jidToAdd)) {
          authData.users.push(jidToAdd);
          saveAuthData();
          await sock.sendMessage(from, { text: `✅ Registered user: ${jidToAdd}` });
        }
      }
      return;
    }

    // === 🛑 Authorization check
    if (!isAuthorized(from)) return;

    // === 💓 Ping command
    if (command === 'ping') {
      const start = Date.now();
      await sock.sendMessage(from, { text: 'pong!' });
      await sock.sendPresenceUpdate('unavailable');
      const ping = Date.now() - start;
      await sock.sendMessage(from, { text: `pong! ${ping} ms` });
      await sock.sendPresenceUpdate('unavailable');
      return;
    }

    // === 🧩 Plugin commands
    if (plugins.has(command)) {
      try {
        await plugins.get(command).execute(sock, m, args);
        await sock.sendPresenceUpdate('unavailable');
      } catch (err) {
        console.error(`⚠️ Error in plugin ${command}:`, err);
      }
    }
  });

  sock.ev.on('messages.update', () => {});
  sock.ev.on('message-receipt.update', () => {});
  sock.ev.on('presence.update', () => {});
}

startBot();
