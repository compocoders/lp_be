import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/db.js';

const PORT = env.PORT;

const startServer = async () => {
  try {
    // Attempt database connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
