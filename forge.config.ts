import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerAppImage } from '@reforged/maker-appimage';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// prebuilds/<platform>-<arch>/… folders, or prebuilds/<platform>-<arch>.node files (better-sqlite3)
const PREBUILD = /[/\\]prebuilds[/\\]([^/\\]+?)(?:\.node)?(?=$|[/\\])/;
const KEEP_LOCALES = new Set(['en-US.pak']);

// The UI is English only; Chromium falls back to en-US for its own strings
async function pruneLocales(buildPath: string) {
    const dir = path.join(buildPath, 'locales');
    const files = await readdir(dir).catch(() => []);
    await Promise.all(files.filter((f) => !KEEP_LOCALES.has(f)).map((f) => rm(path.join(dir, f))));
}

const config: ForgeConfig = {
    packagerConfig: {
        icon: 'assets/icon',
        appCopyright: `Copyright © ${new Date().getFullYear()} relevantcroissant`,
        // The Vite plugin only packages .vite/ by default. Externalized runtime dependencies
        // (webtorrent, better-sqlite3) also need node_modules; devDependencies are pruned.
        // Prebuilds for other platforms are dropped, rpm's strip step fails on foreign binaries.
        ignore: (file) => {
            if (!file) return false;
            if (!/^[/\\](\.vite|node_modules|package\.json)($|[/\\])/.test(file)) return true;
            const prebuild = PREBUILD.exec(file)?.[1];
            return !!prebuild && prebuild !== `${process.platform}-${process.arch}`;
        },
        asar: {
            unpack: '**/*.node',
        },
        afterExtract: [
            (buildPath, _version, _platform, _arch, done) =>
                void pruneLocales(buildPath).then(() => done(), done),
        ],
    },
    rebuildConfig: {},
    makers: [
        new MakerSquirrel({
            setupIcon: 'assets/icon.ico',
            // Shown in Windows' installed apps list, Squirrel downloads it during install
            iconUrl: 'https://raw.githubusercontent.com/JanPlazovnik/akko/main/assets/icon.ico',
            loadingGif: 'assets/installing.gif',
        }),
        new MakerZIP({}, ['darwin']),
        new MakerRpm({ options: { icon: 'assets/icon.png' } }),
        new MakerDeb({ options: { icon: 'assets/icon.png' } }),
        new MakerAppImage({ options: { icon: 'assets/icon.png', categories: ['AudioVideo'] } }),
    ],
    plugins: [
        new VitePlugin({
            // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
            // If you are familiar with Vite configuration, it will look really familiar.
            build: [
                {
                    // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
                    entry: 'src/main/main.ts',
                    config: 'vite.main.config.ts',
                    target: 'main',
                },
                {
                    entry: 'src/preload/preload.ts',
                    config: 'vite.preload.config.ts',
                    target: 'preload',
                },
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'vite.renderer.config.mts',
                },
            ],
        }),
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};

export default config;
