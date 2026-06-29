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
// Only allow requests from known, trusted frontend origins.
// We NEVER use `origin: true` (wildcard reflection) in combination with credentials
// because that allows any malicious site to make authenticated requests on behalf
// of a logged-in user (CSRF-like attack).
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // Vite dev server (local development)
  'http://localhost:3000',   // Sometimes used for local testing
  env.FRONTEND_URL,          // Production frontend URL (set in .env)
].filter(Boolean);           // Remove undefined/null if FRONTEND_URL isn't set

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, Postman, server-to-server calls)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      // Origin is whitelisted — allow it
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
