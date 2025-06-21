const fs = require('fs');
const path = require('path');
const AUTH_FILE = path.join(__dirname, 'authorized.json');

// Load or create auth data
let authData = { users: [], groups: [] };
if (fs.existsSync(AUTH_FILE)) {
  authData = JSON.parse(fs.readFileSync(AUTH_FILE));
} else {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
}

async function saveAuthData() {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));
}

// Helper to check if jid is authorized
function isAuthorized(jid) {
  if (jid.endsWith('@g.us')) {
    // Group JID
    return authData.groups.includes(jid);
  } else {
    // User JID
    return authData.users.includes(jid);
  }
}

sock.ev.on('messages.upsert', async ({ messages }) => {
  const m = messages[0];
  if (!m.message || m.key.fromMe) return;

  const from = m.key.remoteJid;
  const msg = m.message.conversation || m.message.extendedTextMessage?.text || '';

  // .reg command (only allowed from owner or bot admin)
  if (msg.startsWith('.reg ')) {
    const jidToAdd = msg.slice(5).trim();
    if (jidToAdd.endsWith('@g.us')) {
      if (!authData.groups.includes(jidToAdd)) {
        authData.groups.push(jidToAdd);
        await sock.sendMessage(from, { text: `✅ Group registered: ${jidToAdd}` });
      } else {
        await sock.sendMessage(from, { text: `⚠️ Group already registered.` });
      }
    } else {
      // Assuming user jid format is full (like 947xxxxxxxx@s.whatsapp.net)
      if (!authData.users.includes(jidToAdd)) {
        authData.users.push(jidToAdd);
        await sock.sendMessage(from, { text: `✅ User registered: ${jidToAdd}` });
      } else {
        await sock.sendMessage(from, { text: `⚠️ User already registered.` });
      }
    }
    await saveAuthData();
    return;
  }

  // Check authorization before processing other commands
  if (!isAuthorized(from)) {
    await sock.sendMessage(from, { text: '❌ You are not authorized to use this bot. Please register first.' });
    return;
  }

  // Continue with your existing command handling here...
});
