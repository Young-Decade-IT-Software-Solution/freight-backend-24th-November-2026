import mongoose from 'mongoose';

let mongodInstance = null;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.MONGODB_URI) {
      throw new Error('[DB] FATAL: MONGODB_URI environment variable is strictly required in production mode. Silent in-memory fallback is disabled.');
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[DB] Connected to Production MongoDB at: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/freighterp';
  try {
    // Attempt standard connection first with 3 second timeout
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log(`[DB] Connected to MongoDB at: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.warn(`[DB] Standard MongoDB connection to ${uri} failed: ${err.message}`);
    console.log('[DB] Initializing embedded MongoDB server fallback for seamless local execution...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create({
        instance: {
          dbName: 'freighterp',
        },
      });
      const memUri = mongodInstance.getUri();
      const conn = await mongoose.connect(memUri);
      console.log(`[DB] Embedded MongoDB running and connected at: ${memUri}`);
      return conn;
    } catch (innerErr) {
      console.error('[DB] Failed to launch embedded MongoDB:', innerErr);
      throw innerErr;
    }
  }
};

export const closeDB = async () => {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
};
