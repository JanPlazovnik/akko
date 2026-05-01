<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{
    query?: Record<string, string>;
    variant?: 'pill' | 'tag';
}>();

const router = useRouter();

const BASE = 'text-xs transition-colors';
const VARIANTS = {
    pill: 'px-3 py-1 rounded-full bg-white/10 text-white/70',
    tag: 'px-2.5 py-0.5 rounded-md border border-white/15 text-white/40 text-[11px]',
};
const HOVER = {
    pill: 'hover:bg-white/20 cursor-pointer',
    tag: 'hover:border-white/30 hover:text-white/60 cursor-pointer',
};

function cls(clickable: boolean) {
    const v = props.variant ?? 'pill';
    return [BASE, VARIANTS[v], clickable ? HOVER[v] : ''].join(' ');
}

function navigate() {
    if (props.query) router.push({ path: '/search', query: props.query });
}
</script>

<template>
    <button v-if="query" :class="cls(true)" @click.stop="navigate">
        <slot />
    </button>
    <span v-else :class="cls(false)">
        <slot />
    </span>
</template>
