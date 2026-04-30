import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    root: 'src/renderer',
    plugins: [vue(), tailwindcss()],
});
