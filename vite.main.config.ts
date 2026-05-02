import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: [
                'webtorrent',
                'better-sqlite3',
                'ffmpeg-static',
                'ffprobe-static',
                'fluent-ffmpeg',
            ],
        },
    },
});
