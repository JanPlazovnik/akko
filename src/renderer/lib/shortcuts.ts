import { ref } from 'vue';
import { translateOr } from '../i18n';

// `label` is a key under shortcuts.actions
export type Shortcut = { keys: string[][]; label: string };

// Each inner list is one key combination; several are shown side by side, split by a slash
export const SHORTCUT_GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
    {
        title: 'player',
        shortcuts: [
            { keys: [['Space'], ['K'], ['Click']], label: 'playPause' },
            { keys: [['F'], ['Double click']], label: 'fullscreen' },
            { keys: [['Esc']], label: 'exitFullscreen' },
            { keys: [['←'], ['→']], label: 'seek5' },
            { keys: [['J'], ['L']], label: 'seek10' },
            { keys: [['0–9']], label: 'jump' },
            { keys: [['↑'], ['↓']], label: 'volume' },
            { keys: [['M']], label: 'mute' },
            { keys: [['C']], label: 'subtitles' },
            { keys: [['Shift', 'P']], label: 'previous' },
            { keys: [['Shift', 'N']], label: 'next' },
        ],
    },
    {
        title: 'anywhere',
        shortcuts: [
            { keys: [['Ctrl', 'K'], ['/']], label: 'search' },
            { keys: [['?']], label: 'shortcuts' },
        ],
    },
];

// Letters and symbols stay as they are; named keys like Space can be translated
export const keyLabel = (key: string) => translateOr(`shortcuts.keys.${key}`, key);

export const shortcutsOpen = ref(false);

export function openShortcuts() {
    shortcutsOpen.value = true;
}
