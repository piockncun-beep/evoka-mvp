require('dotenv').config({ path: '.env' });
console.log('CLERK_SECRET_KEY loaded:', !!process.env.CLERK_SECRET_KEY);
console.log('CLERK_SECRET_KEY startsWith sk_', (process.env.CLERK_SECRET_KEY || '').startsWith('sk_'));
