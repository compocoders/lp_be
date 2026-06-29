import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let resend;
let transporter;
let isEthereal = false;
let isGmail = false;

// Initialize email transport
if (env.SMTP_EMAIL && env.SMTP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.SMTP_EMAIL,
      pass: env.SMTP_PASSWORD,
    },
  });
  isGmail = true;
  console.log(`✅ Email service initialized with Gmail SMTP (${env.SMTP_EMAIL})`);
} else if (env.RESEND_API_KEY) {
  resend = new Resend(env.RESEND_API_KEY);
  console.log('✅ Email service initialized with Resend');
} else {
  console.log('⚠️ No SMTP or Resend config found. Falling back to Ethereal Email for testing.');
  isEthereal = true;
  // Create a test account dynamically if using Ethereal
  nodemailer.createTestAccount((err, account) => {
    if (err) {
      console.error('Failed to create a testing account. ' + err.message);
      return;
    }
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: {
        user: account.user,
        pass: account.pass,
      },
    });
    console.log('✅ Ethereal Email test account created ready to send mock emails.');
  });
}

/**
 * Sends an email using Gmail SMTP, Resend, or Ethereal (local dev).
 */
export const sendEmail = async (to, subject, html) => {
  if (isGmail && transporter) {
    const info = await transporter.sendMail({
      from: `"Likhâ" <${env.SMTP_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log(`📩 [GMAIL SENT] To: ${to} | Subject: ${subject}`);
    return info;
  } else if (isEthereal && transporter) {
    const info = await transporter.sendMail({
      from: '"Likhâ" <noreply@likha.app>',
      to,
      subject,
      html,
    });
    console.log(`📩 [TEST EMAIL SENT] To: ${to} | Subject: ${subject}`);
    console.log(`🔍 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  } else if (resend) {
    const { data, error } = await resend.emails.send({
      from: 'Likhâ <onboarding@resend.dev>', // Update this when you have a verified domain on Resend
      to,
      subject,
      html,
    });
    if (error) {
      console.error('Resend error:', error);
      if (error.message?.includes('domain restriction') || error.message?.includes('testing emails')) {
        throw new ApiError(400, 'Resend Free Tier Limitation: You can only send test emails to your registered Resend email address. To send to others, you must verify a domain in Resend.');
      }
      throw new ApiError(500, 'Failed to send email: ' + (error.message || 'Unknown error'));
    }
    console.log(`📩 [EMAIL SENT] To: ${to} | Subject: ${subject}`);
    return data;
  } else {
    throw new Error('Email transport not initialized');
  }
};

/**
 * Sends a 6-digit OTP for email verification.
 */
export const sendVerificationEmail = async (to, otp) => {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #52704E;">Verify Your Account</h2>
      <p>Welcome to Likhâ! Please use the following 6-digit code to verify your email address:</p>
      <div style="background-color: #F4F5F4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #698864;">${otp}</span>
      </div>
      <p>This code will expire in 1 hour.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Verify your email address - Likhâ', html);
};

/**
 * Sends a 6-digit OTP for updating email address.
 */
export const sendEmailUpdateOTP = async (to, otp) => {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #52704E;">Verify Your New Email Address</h2>
      <p>You recently requested to update your email address on Likhâ. Please use the following 6-digit code to verify this new email:</p>
      <div style="background-color: #F4F5F4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #698864;">${otp}</span>
      </div>
      <p>This code will expire in 1 hour.</p>
      <p>If you did not request this change, please safely ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Verify your new email address - Likhâ', html);
};

/**
 * Sends a 6-digit OTP for password reset.
 */
export const sendPasswordResetEmail = async (to, otp) => {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #52704E;">Password Reset Request</h2>
      <p>We received a request to reset your password. Use the following 6-digit code to reset it:</p>
      <div style="background-color: #F4F5F4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #698864;">${otp}</span>
      </div>
      <p>This code will expire in 15 minutes.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    </div>
  `;
  return sendEmail(to, 'Password Reset Code - Likhâ', html);
};
