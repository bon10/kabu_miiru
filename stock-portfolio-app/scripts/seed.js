import { seedDatabase } from '../src/lib/seed.ts';

seedDatabase().catch(console.error);