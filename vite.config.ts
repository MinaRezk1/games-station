import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// لازم يبقى نفس اسم الـ repo على GitHub
export default defineConfig({
  plugins: [react()],
  base: '/games-station/',
});
