import { uploadProfilePicture } from './src/services/s3.service.js';
import crypto from 'crypto';

async function testUpload() {
  try {
    const dummyFile = {
      originalname: 'test2.jpg',
      buffer: Buffer.from('hello world'),
      mimetype: 'image/jpeg'
    };
    console.log('Uploading dummy file...');
    const result = await uploadProfilePicture(dummyFile);
    console.log('Upload success:', result);
  } catch (error) {
    console.error('Upload error:', error);
  }
}

testUpload();
