import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

// Middlewares
app.use(cors({
  origin: true, // Allow all origins to reflect dynamically (standard for local dev with credentials)
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);
app.get('/', (req, res) => {
  res.send('Welcome to the Learning Platform API!');
});
// Centralized Error Handling
app.use(errorHandler);

export default app;
