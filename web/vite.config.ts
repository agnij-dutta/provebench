import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Cross-origin isolation is required for SharedArrayBuffer, which bb.js needs
// for multithreaded WASM proving. Production hosts must send the same headers
// (see public/_headers and vercel.json).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [nodePolyfills({ include: ['buffer', 'process', 'util', 'stream', 'events', 'os', 'crypto'] })],
  server: { headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: {
    exclude: ['@aztec/bb.js', '@noir-lang/noirc_abi', '@noir-lang/acvm_js'],
    esbuildOptions: { target: 'esnext' },
  },
  build: { target: 'esnext', chunkSizeWarningLimit: 20000 },
  worker: { format: 'es' },
});
