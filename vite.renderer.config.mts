import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

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

        {
            name: 'inline-app-icon',
            transformIndexHtml: (html) =>
                html.replace(
                    '<!-- app-icon -->',
                    fs.readFileSync(path.resolve(__dirname, 'assets/icon.svg'), 'utf-8')
                ),
        },
    ],

    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@': path.resolve(__dirname, 'src/renderer'),
        },
    },

    build: {
        outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    },

    worker: {
        format: 'es',
    },

    optimizeDeps: {
        exclude: ['@videojs/html'],
    },
});
