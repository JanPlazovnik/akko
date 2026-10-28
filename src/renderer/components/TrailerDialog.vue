<script setup lang="ts">
import { computed } from 'vue';
import {
    DialogClose,
    DialogContent,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui';
import { X } from '@lucide/vue';
import type { Trailer } from '../stores/media';
import { ignoreWindowControls } from '../lib/dialog';

const props = defineProps<{ open: boolean; trailer: Trailer; title: string }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const EMBEDS: Record<Trailer['site'], (id: string) => string> = {
    youtube: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    dailymotion: (id) => `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
};

const src = computed(() => EMBEDS[props.trailer.site](props.trailer.id));
</script>

<template>
    <DialogRoot :open="open" @update:open="emit('update:open', $event)">
        <DialogPortal>
            <DialogOverlay class="dialog-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
            <!-- Closing unmounts the iframe, which stops playback -->
            <DialogContent
                class="dialog-content no-drag fixed top-1/2 left-1/2 z-50 w-[min(1040px,calc(100vw-96px),calc((100vh-160px)*16/9))] -translate-1/2 outline-none"
                :aria-describedby="undefined"
                @interact-outside="ignoreWindowControls"
            >
                <div class="mb-3 flex items-center gap-4">
                    <DialogTitle class="truncate font-display text-lg font-semibold">
                        {{ title }}
                        <span class="ml-1 font-sans text-sm font-normal text-white/45">{{
                            $t('trailer.label')
                        }}</span>
                    </DialogTitle>
                    <DialogClose
                        class="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X :size="16" />
                    </DialogClose>
                </div>
                <iframe
                    :src="src"
                    class="aspect-video w-full rounded-2xl bg-black shadow-2xl shadow-black/70 ring-1 ring-white/10"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowfullscreen
                />
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
