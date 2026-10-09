const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');

const PORT = env.PORT || 5000;

async function startServer() {
  // Connect to MongoDB
  await connectDB();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`  जन कनेक्ट (JAN CONNECT) API सर्वर चालू है`);
    console.log(`  Port: http://localhost:${PORT}`);
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/v1/health`);
    console.log(`=========================================`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Gracefully shutting down...');
    server.close(() => {
      console.log('[Server] Closed remaining connections.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
