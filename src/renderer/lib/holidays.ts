import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';

export type Holiday = 'HALLOWEEN' | 'CHRISTMAS' | 'NEW_YEAR';

export const HOLIDAY_LABELS: Record<Holiday, string> = {
    HALLOWEEN: 'Halloween',
    CHRISTMAS: 'Christmas',
    NEW_YEAR: 'New Year',
};

// Inclusive [month, day] ranges, months counted from 1; New Year wraps around the year end
const WINDOWS: { holiday: Holiday; from: [number, number]; to: [number, number] }[] = [
    { holiday: 'HALLOWEEN', from: [10, 24], to: [11, 1] },
    { holiday: 'CHRISTMAS', from: [12, 18], to: [12, 26] },
    { holiday: 'NEW_YEAR', from: [12, 31], to: [1, 1] },
];

export const PRESET_DATES = [
    { label: 'Halloween', month: 10, day: 31 },
    { label: 'Christmas Eve', month: 12, day: 24 },
    { label: "New Year's Eve", month: 12, day: 31 },
    { label: 'Ordinary day', month: 6, day: 15 },
];

export function holidayOn(date: Date): Holiday | null {
    const today = (date.getMonth() + 1) * 100 + date.getDate();
    const match = WINDOWS.find(({ from, to }) => {
        const start = from[0] * 100 + from[1];
        const end = to[0] * 100 + to[1];
        return start <= end ? today >= start && today <= end : today >= start || today <= end;
    });
    return match?.holiday ?? null;
}

// The Playground sets this to preview a date; it isn't saved
export const dateOverride = ref<Date | null>(null);

// Hourly, so a window that opens at midnight shows up without a restart
const now = ref(new Date());
setInterval(() => (now.value = new Date()), 60 * 60 * 1000);

export function useHoliday() {
    const settings = useSettingsStore();
    return computed(() => {
        if (dateOverride.value) return holidayOn(dateOverride.value);
        if (settings.settings?.holidayEffects === false) return null;
        return holidayOn(now.value);
    });
}

const focused = ref(document.hasFocus());
window.addEventListener('focus', () => (focused.value = true));
window.addEventListener('blur', () => (focused.value = false));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Ambient effects stay out of the way of playback and stop while the window is in the background
export function useAmbientEffects() {
    const route = useRoute();
    const player = usePlayerStore();
    const holiday = useHoliday();
    return computed(() =>
        route.path !== '/player' && !player.isPlaying && focused.value && !reducedMotion.matches
            ? holiday.value
            : null
    );
}
