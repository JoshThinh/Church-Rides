import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' lets the built site work from any folder (Vercel, GitHub Pages, etc.)
export default defineConfig({
  plugins: [react()],
  base: './',
});
