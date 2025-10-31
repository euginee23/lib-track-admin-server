// qrCodeUploadDelete_test.js
// Simple Node script to DELETE a QR image on the uploads endpoint.
// Defaults:
//   FILENAME = '1761886284279-141511946.jpg'
//   TARGET_BASE = <UPLOAD_DOMAIN> or https://api.libtrack.codehub.site
// You can override with environment variables: FILENAME, TARGET_BASE
// Usage (PowerShell):
//   npm install axios
//   # run with defaults
//   node qrCodeUploadDelete_test.js
//   # or override
//   $env:FILENAME='the-qr-file.jpg'; $env:TARGET_BASE='http://localhost:5000'; node qrCodeUploadDelete_test.js

const axios = require('axios');

const DEFAULT_BASE = (process.env.UPLOAD_DOMAIN || 'https://api.libtrack.codehub.site').replace(/\/+$/,'');
const DEFAULT_FILENAME = '1761886284279-141511946.jpg';
const FILENAME = process.env.FILENAME || DEFAULT_FILENAME;
let TARGET_BASE = process.env.TARGET_BASE || DEFAULT_BASE;

// Trim trailing slash
TARGET_BASE = TARGET_BASE.replace(/\/+$/,'');

const deleteUrl = `${TARGET_BASE}/api/uploads/qr-code/${encodeURIComponent(FILENAME)}`;

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
