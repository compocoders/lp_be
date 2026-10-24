/**
 * ─── Express App Configuration ───────────────────────────────────────────────
 *
 * Sets up the Express application with all global middleware in the correct order:
 *  1. Security headers (helmet)
 *  2. CORS with an explicit origin whitelist + credentials support
 *  3. Cookie parser (required for httpOnly JWT cookie auth)
 *  4. Body parsers (JSON + URL-encoded)
 *  5. API routes
 *  6. Centralized error handler (must be last)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { generalLimiter } from './middlewares/rateLimiter.middleware.js';
import { env } from './config/env.js';

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
// helmet() automatically sets a suite of recommended HTTP security headers:
// X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
// X-DNS-Prefetch-Control, and more. This protects against common web attacks.
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allow configured frontend URL(s), localhost, and local network IPs (for LAN testing)
const customOrigins = env.FRONTEND_URL 
  ? env.FRONTEND_URL.split(',').map((url) => url.trim().replace(/\/+$/, '')) 
  : [];

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  ...customOrigins,
].filter(Boolean);

// Regex matching private/local IPv4 addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const LOCAL_IP_REGEX = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, mobile apps, server-to-server calls)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin) || LOCAL_IP_REGEX.test(origin)) {
      // Origin is whitelisted or local LAN IP — allow it
      callback(null, true);
    } else {
      // Origin is not in the whitelist — block it
      callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    }
  },
  credentials: true, // Allow cookies (needed for httpOnly JWT cookie)
}));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(cookieParser());                           // Parse cookies from incoming requests
app.use(express.json({ limit: '1mb' }));           // Parse JSON bodies; cap at 1MB to prevent payload bombs
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', generalLimiter, routes);

// Root health-check endpoint
app.get('/', (req, res) => {
  res.send('Welcome to the Learning Platform API!');
});

// ─── Global Error Handler ────────────────────────────────────────────────────
// Must be the LAST middleware registered so it catches errors from all routes.
app.use(errorHandler);

export default app;
