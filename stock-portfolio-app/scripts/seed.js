const { seedDatabase } = require('../src/lib/seed.ts');

seedDatabase().catch(console.error);