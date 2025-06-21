const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'authorized.json');

// Load auth data
function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ users: [], groups: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE));
}

// Save auth data
function saveAuth(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  name: 'reg',
  description: 'Register user or group JID to authorize bot usage',
  
  async execute(sock, from, args) {
    if (!args[0]) {
      await sock.sendMessage(from, { text: '❌ Usage: .reg <jid>\nExample: .reg 123456789@s.whatsapp.net or .reg 123456789-123456@g.us' });
      return;
    }

    const jid = args[0];
    if (!jid.includes('@')) {
      await sock.sendMessage(from, { text: '❌ Invalid JID format. Must include @.' });
      return;
    }

    const authData = loadAuth();
    const isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      if (authData.groups.includes(jid)) {
        await sock.sendMessage(from, { text: `✅ Group ${jid} is already registered.` });
      } else {
        authData.groups.push(jid);
        saveAuth(authData);
        await sock.sendMessage(from, { text: `✅ Group ${jid} registered successfully.` });
      }
    } else {
      if (authData.users.includes(jid)) {
        await sock.sendMessage(from, { text: `✅ User ${jid} is already registered.` });
      } else {
        authData.users.push(jid);
        saveAuth(authData);
        await sock.sendMessage(from, { text: `✅ User ${jid} registered successfully.` });
      }
    }
  }
};
