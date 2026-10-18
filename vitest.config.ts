import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src/renderer'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
    },
  },
});
