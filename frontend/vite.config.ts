import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Soroban SDK is lazy-loaded after a user starts a wallet operation.
    // Keep its internal dependency graph intact to avoid circular chunks.
    chunkSizeWarningLimit: 700,
  },
});
