<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Captions, Check } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import { CONTROL_BUTTON } from './styles';

const player = usePlayerStore();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);

const options = computed(() => [
    { id: '', label: 'Off', lang: '' },
    ...player.tracks.map((t) => ({ id: t.id, label: t.label, lang: t.lang })),
]);

function onPointerDown(event: PointerEvent) {
    if (!root.value?.contains(event.target as Node)) open.value = false;
}

watch(open, async (isOpen) => {
    if (!isOpen) return document.removeEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerdown', onPointerDown);
    await nextTick();
    list.value?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
});

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));

function select(id: string) {
    player.activeTrackId = id;
    open.value = false;
}
</script>

<template>
    <div v-if="player.tracks.length" ref="root" class="relative">
        <button
            :class="[CONTROL_BUTTON, player.activeTrackId ? 'text-white' : 'text-white/50']"
            title="Subtitles (c)"
            @click="open = !open"
        >
            <Captions :size="20" />
            <span
                v-if="player.activeTrackId"
                class="absolute bottom-1.5 h-0.5 w-4 rounded-full bg-accent"
            />
        </button>

        <Transition name="menu-pop">
            <div
                v-if="open"
                class="absolute right-0 bottom-full mb-3 w-64 origin-bottom-right rounded-xl border border-line bg-raised/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
                @keydown.esc="open = false"
            >
                <p
                    class="px-3 pt-1.5 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase"
                >
                    Subtitles
                </p>
                <div ref="list" class="max-h-[min(60vh,28rem)] overflow-y-auto">
                    <button
                        v-for="option in options"
                        :key="option.id"
                        :data-active="option.id === player.activeTrackId || undefined"
                        class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/8"
                        @click="select(option.id)"
                    >
                        <Check
                            :size="14"
                            :class="
                                option.id === player.activeTrackId ? 'text-accent' : 'invisible'
                            "
                        />
                        <span class="flex-1 truncate">{{ option.label }}</span>
                        <span
                            v-if="option.lang && option.lang !== 'und'"
                            class="text-[11px] font-medium text-white/35 uppercase"
                        >
                            {{ option.lang }}
                        </span>
                    </button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.menu-pop-enter-active,
.menu-pop-leave-active {
    transition:
        opacity 0.12s ease,
        scale 0.12s ease;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
    opacity: 0;
    scale: 0.96;
}
</style>
