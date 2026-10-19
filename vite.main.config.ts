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
    },
    build: {
        rollupOptions: {
            external: ['webtorrent', 'better-sqlite3', 'koffi'],
        },
    },
});
