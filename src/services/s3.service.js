import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ApiError } from '../utils/ApiError.js';
import crypto from 'crypto';
import path from 'path';
import { env } from '../config/env.js';

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
    },
});

export const uploadProfilePicture = async (file) => {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
        throw new ApiError(500, 'Cloudflare R2 configuration is missing');
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueFilename = `profiles/${crypto.randomUUID()}${fileExtension}`;

    let contentType = file.mimetype;
    if (!contentType || contentType === 'application/octet-stream') {
        if (fileExtension === '.webp') contentType = 'image/webp';
        else if (fileExtension === '.png') contentType = 'image/png';
        else if (fileExtension === '.gif') contentType = 'image/gif';
        else if (fileExtension === '.svg') contentType = 'image/svg+xml';
        else contentType = 'image/jpeg';
    }

    console.log(`Uploading file to S3. Original name: ${file.originalname}, Size: ${file.buffer.length} bytes, Mimetype: ${contentType}`);

    const command = new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: uniqueFilename,
        Body: file.buffer,
        ContentType: contentType,
    });

    try {
        await s3Client.send(command);
        const baseUrl = env.R2_PUBLIC_URL ? env.R2_PUBLIC_URL.replace(/\/+$/, '') : '';
        const fileUrl = baseUrl ? `${baseUrl}/${uniqueFilename}` : uniqueFilename;
        return { fileUrl, key: uniqueFilename };
    } catch (error) {
        console.error('Raw S3 Upload Error:', error);
        throw new ApiError(500, `Failed to upload image to R2: ${error.message}`);
    }
};

export const deleteFile = async (fileKey) => {
    if (!fileKey) return;
    const command = new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: fileKey,
    });

    try {
        await s3Client.send(command);
    } catch (error) {
        console.error('Failed to delete file from R2:', error);
    }
};
