<script setup lang="ts">
import { CircleCheck, CircleX, LoaderCircle, RotateCcw, TriangleAlert } from '@lucide/vue';

export type CheckState = 'running' | 'ok' | 'warn' | 'fail';

defineProps<{ state: CheckState; title: string; detail?: string }>();
defineEmits<{ retry: [] }>();

const ICON = { running: LoaderCircle, ok: CircleCheck, warn: TriangleAlert, fail: CircleX };
const COLOR = {
    running: 'text-white/40',
    ok: 'text-emerald-400',
    warn: 'text-amber-400',
    fail: 'text-red-400',
};
</script>

<template>
    <div class="flex items-start gap-3 rounded-xl bg-raised/60 px-5 py-4 ring-1 ring-line">
        <component
            :is="ICON[state]"
            :size="18"
            :class="['mt-0.5 shrink-0', COLOR[state], state === 'running' && 'animate-spin']"
        />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ title }}</p>
            <p v-if="detail" class="mt-0.5 text-xs leading-relaxed text-white/45">{{ detail }}</p>
        </div>
        <button
            v-if="state === 'warn' || state === 'fail'"
            class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/8 px-3 text-xs font-medium transition-colors hover:bg-white/14"
            @click="$emit('retry')"
        >
            <RotateCcw :size="13" />
            {{ $t('common.retry') }}
        </button>
    </div>
</template>
