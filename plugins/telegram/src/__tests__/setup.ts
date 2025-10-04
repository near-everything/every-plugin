import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.test file
config({ path: resolve(__dirname, '../../.env.test') });

// Log loaded environment variables for debugging (without exposing sensitive data)
console.log('🔧 Test setup loaded environment variables:');
console.log(`- TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Loaded' : '❌ Missing'}`);
console.log(`- TELEGRAM_TEST_CHAT_ID: ${process.env.TELEGRAM_TEST_CHAT_ID || 'Not set'}`);
console.log(`- TELEGRAM_TEST_USER_ID: ${process.env.TELEGRAM_TEST_USER_ID || 'Not set'}`);
console.log(`- TELEGRAM_WEBHOOK_TOKEN: ${process.env.TELEGRAM_WEBHOOK_TOKEN ? '✅ Loaded' : '❌ Missing'}`);
console.log(`📱 Tests will run in group: "Elliot & efizzybot, test curation" (${process.env.TELEGRAM_TEST_CHAT_ID})`);
