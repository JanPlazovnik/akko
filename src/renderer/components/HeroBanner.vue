<script setup lang="ts">
import { ref, computed } from 'vue';
import { Play, Star } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import { useMediaStore } from '../stores/media';
import { useAccountsStore } from '../stores/accounts';
import Badge from './ui/Badge.vue';
import { accentStyle } from '../lib/accent';
import { mediaMeta, stripHtml } from '../lib/media-labels';

const SLIDE_MS = 7000;

const props = defineProps<{ items: Media[] }>();
const mediaStore = useMediaStore();
const accounts = useAccountsStore();

const heroIndex = ref(0);
const paused = ref(false);

const current = computed(() => props.items[heroIndex.value]);

function go(index: number) {
    if (!props.items.length) return;
    heroIndex.value = (index + props.items.length) % props.items.length;
}
</script>

<template>
    <section
        class="relative h-[min(68vh,620px)] min-h-[440px] overflow-hidden"
        :style="accentStyle(current?.coverImage?.color)"
        @mouseenter="paused = true"
        @mouseleave="paused = false"
    >
        <Transition name="hero-fade">
            <div v-if="current" :key="current.id" class="absolute inset-0">
                <img
                    v-if="current.bannerImage"
                    :src="current.bannerImage"
                    class="absolute inset-0 size-full object-cover"
                />
                <div v-else class="absolute inset-0 bg-raised" />
                <div
                    class="absolute inset-0 bg-linear-to-r from-surface from-5% via-surface/55 via-40% to-transparent to-75%"
                />
                <div
                    class="absolute inset-0 bg-linear-to-t from-surface via-transparent via-35% to-transparent"
                />
            </div>
        </Transition>

        <Transition name="hero-fade" mode="out-in">
            <div
                v-if="current"
                :key="current.id"
                class="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-4 px-10 pb-14"
            >
                <p
                    class="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-accent uppercase"
                >
                    Trending #{{ heroIndex + 1 }}
                </p>

                <!-- The padding keeps line-clamp from clipping descenders on the last line -->
                <h2
                    class="line-clamp-2 pb-1 font-display text-5xl leading-[1.1] font-bold tracking-tight text-balance"
                >
                    {{ accounts.titleOf(current) }}
                </h2>

                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                    <span
                        v-if="current.averageScore"
                        class="flex items-center gap-1 font-semibold text-white"
                    >
                        <Star :size="14" class="fill-accent text-accent" />
                        {{ current.averageScore }}%
                    </span>
                    <template v-for="part in mediaMeta(current)" :key="part">
                        <span class="text-white/25">•</span>
                        <span>{{ part }}</span>
                    </template>
                </div>

                <p class="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/60">
                    {{ stripHtml(current.description) }}
                </p>

                <div class="mt-2 flex items-center gap-3">
                    <button
                        class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-[0.97]"
                        @click="mediaStore.viewMedia(current)"
                    >
                        <Play :size="15" fill="currentColor" />
                        Watch now
                    </button>
                    <div v-if="current.genres?.length" class="ml-2 flex flex-wrap gap-1.5">
                        <Badge
                            v-for="genre in current.genres.filter(Boolean).slice(0, 3)"
                            :key="genre!"
                            variant="tag"
                            :query="{ genres: genre! }"
                        >
                            {{ genre }}
                        </Badge>
                    </div>
                </div>
            </div>
        </Transition>

        <div class="absolute right-10 bottom-14 z-10 flex gap-1.5">
            <button
                v-for="(item, i) in items"
                :key="item.id"
                class="h-1 w-8 cursor-pointer overflow-hidden rounded-full bg-white/20"
                :title="accounts.titleOf(item)"
                @click="go(i)"
            >
                <span
                    v-if="i === heroIndex"
                    :key="`${item.id}-${heroIndex}`"
                    :class="['hero-progress block h-full bg-white', paused && 'is-paused']"
                    :style="{ animationDuration: `${SLIDE_MS}ms` }"
                    @animationend="go(heroIndex + 1)"
                />
                <span v-else-if="i < heroIndex" class="block h-full bg-white/50" />
            </button>
        </div>
    </section>
</template>

<style scoped>
.hero-fade-enter-active,
.hero-fade-leave-active {
    transition: opacity 0.5s ease;
}
.hero-fade-leave-active {
    position: absolute;
    inset: 0;
}
.hero-fade-enter-from,
.hero-fade-leave-to {
    opacity: 0;
}

.hero-progress {
    animation: hero-progress linear forwards;
    transform-origin: left;
}
.hero-progress.is-paused {
    animation-play-state: paused;
}

@keyframes hero-progress {
    from {
        transform: scaleX(0);
    }
    to {
        transform: scaleX(1);
    }
}
</style>
