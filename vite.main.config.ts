import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function commitHash() {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        return 'unknown';
    }
}

// https://vitejs.dev/config
export default defineConfig({
    define: {
        __COMMIT__: JSON.stringify(commitHash()),
        // Test builds can point at a local folder of releases instead
        __UPDATE_FEED__: JSON.stringify(
            process.env.AKKO_UPDATE_FEED ??
                'https://github.com/JanPlazovnik/akko/releases/latest/download'
        ),
    },
    build: {
        rollupOptions: {
            external: ['webtorrent', 'utp-native', 'better-sqlite3', 'velopack'],
        },
    },
});
