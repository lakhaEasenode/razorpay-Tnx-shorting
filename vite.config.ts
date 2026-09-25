import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /<repo-name>/; only the local dev server stays at the root.
  base: command === 'serve' && !isPreview ? '/' : '/razorpay-Tnx-shorting/',
  worker: { format: 'es' },
}));
