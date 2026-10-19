import { ref } from 'vue';

export type Shortcut = { keys: string[][]; label: string };

// Each inner list is one key combination; several are shown side by side, split by a slash
export const SHORTCUT_GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
    {
        title: 'Player',
        shortcuts: [
            { keys: [['Space'], ['K'], ['Click']], label: 'Play or pause' },
            { keys: [['F'], ['Double click']], label: 'Fullscreen' },
            { keys: [['Esc']], label: 'Exit fullscreen' },
            { keys: [['←'], ['→']], label: 'Back or forward 5 seconds' },
            { keys: [['J'], ['L']], label: 'Back or forward 10 seconds' },
            { keys: [['0–9']], label: 'Jump to 0% to 90%' },
            { keys: [['↑'], ['↓']], label: 'Volume up or down' },
            { keys: [['M']], label: 'Mute' },
            { keys: [['C']], label: 'Subtitles on or off' },
            { keys: [['Shift', 'P']], label: 'Previous episode' },
            { keys: [['Shift', 'N']], label: 'Next episode' },
        ],
    },
    {
        title: 'Anywhere',
        shortcuts: [
            { keys: [['Ctrl', 'K'], ['/']], label: 'Search' },
            { keys: [['?']], label: 'Keyboard shortcuts' },
        ],
    },
];

export const shortcutsOpen = ref(false);

export function openShortcuts() {
    shortcutsOpen.value = true;
}
