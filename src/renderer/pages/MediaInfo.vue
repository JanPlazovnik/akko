<script setup lang="ts">
import { computed } from 'vue';
import { Play } from '@lucide/vue';
import { useAnilistStore } from '../stores/anilist';

const anilist = useAnilistStore();
const media = computed(() => anilist.selectedMedia);

const stripHtml = (s?: string | null) => s?.replace(/<[^>]*>/g, '') ?? '';

const episodeCount = computed(() => media.value?.episodes ?? 0);
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white">
        <template v-if="media">
            <!-- Banner -->
            <div class="h-[220px] relative overflow-hidden">
                <img
                    v-if="media.bannerImage"
                    :src="media.bannerImage"
                    class="absolute inset-0 w-full h-full object-cover"
                />
                <div v-else class="absolute inset-0 bg-neutral-800" />
                <div class="absolute inset-0 bg-linear-to-b from-transparent to-neutral-900" />
            </div>

            <div class="-mt-16 px-8 relative">
                <!-- Poster + info -->
                <div class="flex gap-6 items-end mb-6">
                    <div
                        class="w-[140px] h-[210px] rounded-lg overflow-hidden bg-neutral-800 shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                    >
                        <img
                            v-if="media.coverImage?.large"
                            :src="media.coverImage.large"
                            class="w-full h-full object-cover"
                        />
                    </div>

                    <div class="pb-1 flex-1">
                        <p class="text-[10px] text-white/40 uppercase tracking-widest mb-1">
                            {{ media.format
                            }}{{ media.startDate?.year ? ` · ${media.startDate.year}` : '' }}
                        </p>
                        <h1 class="text-2xl font-bold text-white leading-tight mb-3">
                            {{ media.title?.userPreferred }}
                        </h1>
                        <div class="flex items-center gap-1.5 flex-wrap mb-3">
                            <span
                                v-if="media.episodes"
                                class="text-xs border border-white/20 text-white/60 px-3 py-1 rounded-full"
                                >{{ media.episodes }} EP</span
                            >
                            <span
                                v-if="media.format"
                                class="text-xs border border-white/20 text-white/60 px-3 py-1 rounded-full"
                                >{{ media.format }}</span
                            >
                            <span
                                v-if="media.status"
                                class="text-xs border border-white/20 text-white/60 px-3 py-1 rounded-full"
                                >{{ media.status }}</span
                            >
                            <span
                                v-if="media.averageScore"
                                class="text-xs bg-white text-black font-bold px-3 py-1 rounded-full"
                                >{{ media.averageScore }}%</span
                            >
                            <span
                                v-for="genre in (media.genres ?? []).slice(0, 3)"
                                :key="genre!"
                                class="text-xs border border-white/10 text-white/35 px-3 py-1 rounded-full"
                                >{{ genre }}</span
                            >
                        </div>
                        <p
                            class="text-white/50 text-xs leading-relaxed max-w-[560px] mb-4 line-clamp-2"
                        >
                            {{ stripHtml(media.description) }}
                        </p>
                        <button
                            class="flex items-center gap-2 bg-white text-black text-xs font-semibold px-4 py-2 rounded-full hover:bg-white/85 transition-opacity cursor-pointer"
                        >
                            <Play :size="11" fill="black" /> Watch now
                        </button>
                    </div>
                </div>

                <!-- Episodes -->
                <div v-if="episodeCount" class="pb-8">
                    <h2 class="text-sm font-semibold mb-3">Episodes &middot; {{ episodeCount }}</h2>
                    <div class="grid grid-cols-2 gap-2">
                        <div
                            v-for="ep in episodeCount"
                            :key="ep"
                            class="flex gap-3 p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                            <div
                                class="w-[100px] h-[60px] bg-neutral-700 rounded shrink-0 relative overflow-hidden flex items-center justify-center"
                            >
                                <span class="text-[10px] text-white/30">EP {{ ep }}</span>
                            </div>
                            <div class="flex-1 min-w-0 py-0.5">
                                <p
                                    class="text-white text-xs font-medium leading-tight mb-1 truncate"
                                >
                                    Episode {{ ep }}
                                </p>
                                <p class="text-white/35 text-[10px] leading-relaxed line-clamp-2">
                                    No synopsis available.
                                </p>
                            </div>
                            <span class="text-[9px] text-white/25 shrink-0 pt-0.5">~24m</span>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
