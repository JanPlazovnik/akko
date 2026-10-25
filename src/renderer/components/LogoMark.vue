<script setup lang="ts">
import { computed } from 'vue';
import { useHoliday, type Holiday } from '../lib/holidays';

// Leaving out `holiday` follows today's date; null always draws the plain mark
const props = defineProps<{ holiday?: Holiday | null }>();
const today = useHoliday();
const holiday = computed(() => (props.holiday === undefined ? today.value : props.holiday));

const BAND_COLORS: Record<Holiday, string> = {
    HALLOWEEN: '#fb923c',
    CHRISTMAS: '#ef4444',
    NEW_YEAR: '#fcd34d',
};

const CONE =
    'M6.2 18 10.9 6.2C11.6 4.3 13.2 3.2 15.2 3.3L17.6 3.5 15.7 4.3C14.4 4.8 13.8 5.9 14.1 7.1L17.8 18Z';
const SPARKLE = 'M0-1.8Q.2-.2 1.8 0 .2.2 0 1.8-.2.2-1.8 0-.2-.2 0-1.8Z';
</script>

<template>
    <svg viewBox="0 0 24 24" aria-hidden="true" overflow="visible">
        <defs>
            <clipPath id="akko-hat-cone">
                <path :d="CONE" />
            </clipPath>
        </defs>
        <path fill="currentColor" :d="CONE" />
        <path
            :fill="holiday ? BAND_COLORS[holiday] : '#b9a6ff'"
            clip-path="url(#akko-hat-cone)"
            :class="holiday === 'HALLOWEEN' && 'drop-shadow-[0_0_1.5px_#fb923c]'"
            d="M4 13.1Q12 15 20 13.1V15.5Q12 17.4 4 15.5Z"
        />
        <ellipse fill="currentColor" cx="12" cy="18" rx="10" ry="2.6" />

        <!-- The canvas-coloured stroke keeps the decoration apart from the hat -->
        <circle
            v-if="holiday === 'CHRISTMAS'"
            cx="17.8"
            cy="3.6"
            r="1.6"
            fill="#ffffff"
            stroke-width="1.1"
            paint-order="stroke"
            class="[stroke:var(--color-canvas)]"
        />
        <path
            v-else-if="holiday === 'NEW_YEAR'"
            :d="SPARKLE"
            transform="translate(5.2 6.4) scale(1.4)"
            fill="#fde68a"
        />
    </svg>
</template>
