// delete_test.js
// Simple Node script to DELETE a file on the uploads endpoint.
// Defaults:
//   DEFAULT_FILENAME = '1698741234-123456789.jpg' (the filename as stored on the server)
//   TARGET_BASE = https://api.libtrack.codehub.site
// You can override the target or filename with environment variables (optional):
//   FILENAME, TARGET_BASE
// Usage (PowerShell):
//   npm install axios
//   # run with defaults
//   node delete_test.js
//   # or override (example)
//   $env:FILENAME='the-file-name.jpg'; $env:TARGET_BASE='http://localhost:5000'; node delete_test.js

const axios = require('axios');

// Prefer UPLOAD_DOMAIN from .env if present (keeps parity with server's UPLOAD_DOMAIN)
const DEFAULT_BASE = (process.env.UPLOAD_DOMAIN || 'https://api.libtrack.codehub.site').replace(/\/+$/,'');
// Default filename — matches the style used by upload_test.js (has an in-file default)
const DEFAULT_FILENAME = '1761886284279-141511946.jpg';
const FILENAME = process.env.FILENAME || DEFAULT_FILENAME;
let TARGET_BASE = process.env.TARGET_BASE || DEFAULT_BASE;

if (!FILENAME) {
  console.error('Please set the FILENAME environment variable to the filename to delete (as stored on the server).');
  process.exit(1);
}

// Trim trailing slash
TARGET_BASE = TARGET_BASE.replace(/\/+$/,'');

const deleteUrl = `${TARGET_BASE}/api/uploads/book-cover/${encodeURIComponent(FILENAME)}`;

async function run() {
  try {
    console.log('Sending DELETE to', deleteUrl);
    const resp = await axios.delete(deleteUrl, { timeout: 60000 });
    console.log('Delete successful. Status:', resp.status);
    console.log('Response body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('Delete failed. Status:', err.response.status);
      console.error('Response:', err.response.data);
    } else {
      console.error('Delete error:', err.message);
    }
    process.exit(2);
  }
}

run();
