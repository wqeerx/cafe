const path = require('path');
const fs = require('fs');

function loadEnv() {
  const root = path.join(__dirname, '..');
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.evn'),
    path.join(root, '.env.local'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '.evn')
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      return envPath;
    }
  }
  return null;
}

module.exports = { loadEnv };
