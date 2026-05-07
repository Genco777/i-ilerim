import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
