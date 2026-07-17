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

export const uploadGenericFile = async (file) => {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
        throw new ApiError(500, 'Cloudflare R2 configuration is missing');
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueFilename = `submissions/${crypto.randomUUID()}${fileExtension}`;

    const command = new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: uniqueFilename,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
    });

    try {
        await s3Client.send(command);
        let publicUrl = env.R2_PUBLIC_URL.replace(/\/+$/, '');
        return {
            fileUrl: `${publicUrl}/${uniqueFilename}`,
            key: uniqueFilename
        };
    } catch (error) {
        console.error('S3 Upload Error:', error);
        throw new ApiError(500, 'Failed to upload file to Cloudflare R2');
    }
};

export const uploadLearningMaterial = async (file) => {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
        throw new ApiError(500, 'Cloudflare R2 configuration is missing');
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const uniqueFilename = `materials/${crypto.randomUUID()}${fileExtension}`;

    const command = new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: uniqueFilename,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
    });

    try {
        await s3Client.send(command);
        let publicUrl = env.R2_PUBLIC_URL.replace(/\/+$/, '');
        return {
            fileUrl: `${publicUrl}/${uniqueFilename}`,
            key: uniqueFilename
        };
    } catch (error) {
        console.error('S3 Upload Error:', error);
        throw new ApiError(500, 'Failed to upload learning material to Cloudflare R2');
    }
};


export const deleteFile = async (fileUrl) => {
    if (!fileUrl) return;

    // Extract the S3 key from the full URL (strip base URL prefix)
    let fileKey = fileUrl;
    const baseUrl = env.R2_PUBLIC_URL ? env.R2_PUBLIC_URL.replace(/\/+$/, '') : '';
    if (baseUrl && fileUrl.startsWith(baseUrl)) {
        fileKey = fileUrl.slice(baseUrl.length).replace(/^\//, '');
    }

    const command = new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: fileKey,
    });

    try {
        await s3Client.send(command);
        console.log(`Deleted file from R2: ${fileKey}`);
    } catch (error) {
        console.error('Failed to delete file from R2:', error);
    }
};
