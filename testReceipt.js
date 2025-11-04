const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
require('dotenv').config();

// Configuration - Use SERVER_BASE_URL from .env (your VPS server)
const SERVER_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';
const IMAGE_PATH = 'C:\\Users\\EUGINE\\Downloads\\TestImage.jpeg';

// Function to test receipt image upload
async function testReceiptUpload() {
  console.log('🧪 Testing Receipt Image Upload...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Check if the image file exists
    if (!fs.existsSync(IMAGE_PATH)) {
      throw new Error(`Image file not found at: ${IMAGE_PATH}`);
    }

    // Get file stats
    const stats = fs.statSync(IMAGE_PATH);
    console.log(`📁 File: ${path.basename(IMAGE_PATH)}`);
    console.log(`📏 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Generate a test receipt filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
    const refNumber = `REF${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
    const fileExtension = path.extname(IMAGE_PATH);
    const receiptFilename = `receipt_${refNumber}_${timestamp}${fileExtension}`;
    
    console.log(`🏷️  Generated filename: ${receiptFilename}`);
    
    // Create FormData for the upload
    const formData = new FormData();
    const fileStream = fs.createReadStream(IMAGE_PATH);
    
    // Append the file with the generated filename
    formData.append('file', fileStream, {
      filename: receiptFilename,
      contentType: 'image/jpeg'
    });

    console.log(`📤 Uploading to: ${SERVER_URL}/api/uploads/receipt`);
    console.log('⏳ Please wait...');

    // Make the upload request using axios
    const response = await axios.post(`${SERVER_URL}/api/uploads/receipt`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000, // 30 second timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Handle successful response
    const result = response.data;
    
    console.log('✅ Upload successful!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Upload Details:');
    console.log(`   • Filename: ${result.file.name}`);
    console.log(`   • URL: ${result.file.url}`);
    console.log(`   • Size: ${(result.file.size / 1024).toFixed(2)} KB`);
    console.log(`   • Type: ${result.file.type}`);
    console.log(`   • Message: ${result.message}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (error.code === 'ENOENT') {
      console.error('📁 File not found. Please check the image path.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Connection refused. Make sure the server is running.');
    } else if (error.code === 'ECONNABORTED') {
      console.error('⏰ Request timed out. Please try again with a smaller image.');
    } else if (error.response) {
      // Server responded with error status
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 413) {
        console.error('� Image file is too large. Please use a smaller image.');
      } else if (error.response.status === 500) {
        console.error('� Server error occurred. Please try again.');
      } else {
        console.error(`📝 Error: ${error.response.data?.message || 'Unknown server error'}`);
      }
    } else {
      console.error(`💥 Error: ${error.message}`);
    }
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw error;
  }
}

// Function to test getting all receipts
async function testGetAllReceipts() {
  console.log('\n📂 Testing Get All Receipts...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const response = await axios.get(`${SERVER_URL}/api/uploads/receipts`, {
      timeout: 10000 // 10 second timeout
    });
    
    const result = response.data;
    
    console.log('✅ Retrieved receipts successfully!');
    console.log(`📊 Total receipts: ${result.files.length}`);
    
    if (result.files.length > 0) {
      console.log('📄 Recent receipts:');
      result.files.slice(-5).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.name}`);
        console.log(`      URL: ${file.url}`);
      });
    } else {
      console.log('📭 No receipts found.');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to get receipts!');
    if (error.response) {
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`Error: ${error.response.data?.message || 'Unknown server error'}`);
    } else {
      console.error(`💥 Error: ${error.message}`);
    }
    throw error;
  }
}

// Function to delete a receipt
async function testDeleteReceipt(filename) {
  console.log(`\n🗑️  Deleting receipt: ${filename}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const response = await axios.delete(`${SERVER_URL}/api/uploads/receipt/${filename}`, {
      timeout: 10000 // 10 second timeout
    });
    
    const result = response.data;
    console.log(`✅ ${result.message}`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to delete receipt: ${filename}`);
    if (error.response) {
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`Error: ${error.response.data?.message || 'Unknown server error'}`);
    } else {
      console.error(`💥 Error: ${error.message}`);
    }
    throw error;
  }
}

// Function to delete all receipts
async function testDeleteAllReceipts() {
  console.log('\n🗑️  Testing Delete All Receipts...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Get all receipts first
    const receiptsResponse = await axios.get(`${SERVER_URL}/api/uploads/receipts`, {
      timeout: 10000
    });
    
    const receipts = receiptsResponse.data.files;
    
    if (receipts.length === 0) {
      console.log('📭 No receipts to delete.');
      return;
    }
    
    console.log(`📊 Found ${receipts.length} receipt(s) to delete`);
    
    // Delete each receipt
    let successCount = 0;
    let failCount = 0;
    
    for (const receipt of receipts) {
      try {
        await testDeleteReceipt(receipt.name);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successfully deleted: ${successCount}`);
    if (failCount > 0) {
      console.log(`❌ Failed to delete: ${failCount}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to delete receipts!');
    if (error.response) {
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`Error: ${error.response.data?.message || 'Unknown server error'}`);
    } else {
      console.error(`💥 Error: ${error.message}`);
    }
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Receipt Upload Tests');
  console.log(`🌐 Server: ${SERVER_URL}`);
  console.log(`🖼️  Test Image: ${IMAGE_PATH}`);
  console.log('');
  
  try {
    // Test 1: Upload receipt
    await testReceiptUpload();
    
    // Test 2: Get all receipts
    await testGetAllReceipts();
    
    // Test 3: Delete all receipts
    await testDeleteAllReceipts();
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.log('\n💥 Tests failed!');
    process.exit(1);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testReceiptUpload,
  testGetAllReceipts,
  testDeleteReceipt,
  testDeleteAllReceipts,
  runTests
};