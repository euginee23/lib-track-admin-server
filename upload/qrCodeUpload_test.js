// qrCodeUpload_test.js
// Simple Node script to POST a local QR image as multipart/form-data to the qr-code upload endpoint.
// Defaults:
//   FILE_PATH = C:\\Users\\EUGINE\\Downloads\\qr-image.png
//   TARGET_URL = <UPLOAD_DOMAIN>/api/uploads/qr-code
// You can override with environment variables: FILE_PATH, TARGET_URL
// Usage (PowerShell):
//   npm install axios form-data
//   $env:FILE_PATH='C:\\path\\to\\qr.png'; node qrCodeUpload_test.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const DEFAULT_FILE = 'C:\\Users\\EUGINE\\Downloads\\fawssadf.png';
const UPLOAD_DOMAIN = process.env.UPLOAD_DOMAIN || 'https://api.libtrack.codehub.site';
const DEFAULT_TARGET = `${UPLOAD_DOMAIN.replace(/\/+$/,'')}/api/uploads/qr-code`;

const FILE_PATH = process.env.FILE_PATH || DEFAULT_FILE;
let TARGET_URL = process.env.TARGET_URL || DEFAULT_TARGET;

// Normalize double slashes in URL path (keep protocol //)
TARGET_URL = TARGET_URL.replace(/([^:]\/)\/+/g, '$1');

if (!fs.existsSync(FILE_PATH)) {
  console.error('File not found:', FILE_PATH);
  process.exit(1);
}

async function upload() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(FILE_PATH), {
      filename: path.basename(FILE_PATH),
    });

    console.log('Uploading', FILE_PATH, 'to', TARGET_URL);

    const headers = form.getHeaders();

    const resp = await axios.post(TARGET_URL, form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000,
    });

    console.log('Upload successful. Status:', resp.status);
    console.log('Response body:', JSON.stringify(resp.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('Upload failed. Status:', err.response.status);
      console.error('Response:', err.response.data);
    } else {
      console.error('Upload error:', err.message);
    }
    process.exit(2);
  }
}

upload();
