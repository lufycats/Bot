const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'authorized.json');

function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ users: [], groups: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE));
}

function saveAuth(auth) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
}

module.exports = {
  name: 'reg',
  description: 'Register user or group to use the bot',
  async execute(sock, from, args) {
    const auth = loadAuth();

    if (from.endsWith('@g.us')) {
      if (!auth.groups.includes(from)) {
        auth.groups.push(from);
        saveAuth(auth);
        await sock.sendMessage(from, { text: '✅ Group registered successfully!' });
      } else {
        await sock.sendMessage(from, { text: '⚠️ Group is already registered.' });
      }
    } else {
      if (!auth.users.includes(from)) {
        auth.users.push(from);
        saveAuth(auth);
        await sock.sendMessage(from, { text: '✅ User registered successfully!' });
      } else {
        await sock.sendMessage(from, { text: '⚠️ You are already registered.' });
      }
    }
  }
};
