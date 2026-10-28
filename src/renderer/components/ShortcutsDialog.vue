<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { X } from '@lucide/vue';
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui';
import { SHORTCUT_GROUPS, keyLabel, shortcutsOpen } from '../lib/shortcuts';
import { ignoreWindowControls } from '../lib/dialog';
import { useFullscreenElement } from '../lib/fullscreen';

const fullscreenElement = useFullscreenElement();

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.key !== '?' || target?.closest('input, textarea, [contenteditable]')) return;
    event.preventDefault();
    shortcutsOpen.value = !shortcutsOpen.value;
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <DialogRoot v-model:open="shortcutsOpen">
        <DialogPortal :to="fullscreenElement ?? 'body'">
            <DialogOverlay class="dialog-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
            <DialogContent
                class="dialog-content no-drag fixed top-1/2 left-1/2 z-50 flex max-h-[84vh] w-[min(560px,calc(100vw-48px))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-white shadow-2xl shadow-black/70 outline-none"
                @interact-outside="ignoreWindowControls"
            >
                <header class="border-b border-line p-5">
                    <DialogTitle class="font-display text-xl font-semibold">
                        {{ $t('shortcuts.title') }}
                    </DialogTitle>
                    <DialogDescription class="mt-1 text-xs text-white/45">
                        {{ $t('shortcuts.description') }}
                    </DialogDescription>
                    <DialogClose
                        class="absolute top-4 right-4 grid size-8 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X :size="16" />
                    </DialogClose>
                </header>

                <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <section v-for="group in SHORTCUT_GROUPS" :key="group.title" class="mt-5">
                        <h3
                            class="text-[11px] font-semibold tracking-wider text-white/40 uppercase"
                        >
                            {{ $t(`shortcuts.groups.${group.title}`) }}
                        </h3>
                        <ul class="mt-2 divide-y divide-line">
                            <li
                                v-for="shortcut in group.shortcuts"
                                :key="shortcut.label"
                                class="flex items-center justify-between gap-4 py-2.5 text-sm"
                            >
                                <span class="text-white/80">{{
                                    $t(`shortcuts.actions.${shortcut.label}`)
                                }}</span>
                                <span class="flex shrink-0 items-center gap-1.5">
                                    <template v-for="(combo, i) in shortcut.keys" :key="i">
                                        <span v-if="i" class="text-xs text-white/25">/</span>
                                        <span class="flex items-center gap-1">
                                            <kbd
                                                v-for="key in combo"
                                                :key="key"
                                                class="min-w-6 rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-sans text-xs text-white/80"
                                            >
                                                {{ keyLabel(key) }}
                                            </kbd>
                                        </span>
                                    </template>
                                </span>
                            </li>
                        </ul>
                    </section>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
