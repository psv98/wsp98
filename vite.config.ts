import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' — відносні шляхи, щоб гра працювала в будь-якій підпапці GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
