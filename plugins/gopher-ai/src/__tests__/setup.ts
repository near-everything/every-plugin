import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load environment variables from .env.test file
config({ path: resolve(__dirname, '../../.env.test') });

// Log loaded environment variables for debugging (without exposing sensitive data)
console.log('🔧 Gopher AI test setup loaded environment variables:');
console.log(`- GOPHERAI_API_KEY: ${process.env.GOPHERAI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
