import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
    root: 'src/renderer',

    plugins: [
        vue({
            template: {
                compilerOptions: {
                    isCustomElement: (tag) => tag.startsWith('video-') || tag.startsWith('media-'),
                },
            },
        }),

        tailwindcss(),
    ],

    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@': path.resolve(__dirname, 'src/renderer'),
        },
    },

    optimizeDeps: {
        exclude: ['@videojs/html'],
    },
});
