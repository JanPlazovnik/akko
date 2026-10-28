<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { Play, Star } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import { useMediaStore } from '../stores/media';
import { useAccountsStore } from '../stores/accounts';
import { accentStyle } from '../lib/accent';
import { formatLabel, stripHtml } from '../lib/media-labels';
import { formatRelativeDate } from '../lib/format';
import { t } from '../i18n';

const props = defineProps<{
    item: Media & { nextAiringEpisode?: { episode: number; airingAt: number } | null };
}>();
const mediaStore = useMediaStore();
const accounts = useAccountsStore();
const isScrolling = inject('rowScrolling', ref(false));
// One card in the row is open at a time; it hands over to the next rather than closing, so one
// shrinks while the other grows and the new card opens towards the one you came from
const openId = inject('openFeatured', ref<number | null>(null));

const title = computed(() => accounts.titleOf(props.item));
const art = computed(() => mediaStore.artFor(props.item.id));
const backdrop = computed(() => props.item.bannerImage ?? art.value.backdrop);
const logoBroken = ref(false);
const logo = computed(() => (logoBroken.value ? null : art.value.logo));

const airing = computed(() => {
    const next = props.item.nextAiringEpisode;
    if (!next) return null;
    const when = formatRelativeDate(new Date(next.airingAt * 1000).toISOString());
    return t('media.airingShort', { episode: next.episode, when });
});

const cardRef = ref<HTMLElement | null>(null);
const expanded = computed(() => openId.value === props.item.id);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function onEnter() {
    hoverTimer = setTimeout(() => {
        if (!isScrolling.value) openId.value = props.item.id;
    }, 250);
}

const onLeave = () => clearTimeout(hoverTimer);

// Once open, scrolls the row so the card isn't cut off at either edge
function reveal(event: TransitionEvent) {
    const card = cardRef.value;
    const row = card?.closest<HTMLElement>('.overflow-x-auto');
    if (!card || !row || !expanded.value || event.target !== card || event.propertyName !== 'width')
        return;
    const { left, right } = card.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const by =
        right > bounds.right ? right - bounds.right + 32 : Math.min(0, left - bounds.left - 32);
    if (by) row.scrollBy({ left: by, behavior: 'smooth' });
}

// Loaded up front, so the logo is there when the card opens
onMounted(() => void mediaStore.fetchArt(props.item.id));
onUnmounted(() => clearTimeout(hoverTimer));
</script>

<template>
    <div
        ref="cardRef"
        :class="[
            'relative h-[300px] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-raised ring-1 ring-white/5 transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            expanded ? 'w-[533px] ring-white/10' : 'w-[200px]',
        ]"
        :style="accentStyle(item.coverImage?.color)"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
        @transitionend="reveal"
        @click="mediaStore.viewMedia(item)"
    >
        <img
            v-if="item.coverImage?.large"
            :src="item.coverImage.large"
            :class="[
                'absolute inset-y-0 left-0 h-full w-[200px] object-cover transition-opacity duration-300',
                expanded && 'opacity-0',
            ]"
        />

        <!-- Laid out at full width from the start, so nothing reflows while the card widens -->
        <div
            :class="[
                'absolute inset-y-0 left-0 w-[533px] transition-opacity duration-300',
                expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
            ]"
        >
            <img v-if="backdrop" :src="backdrop" class="absolute inset-0 size-full object-cover" />
            <img
                v-else-if="item.coverImage?.large"
                :src="item.coverImage.large"
                class="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl"
            />
            <div
                class="absolute inset-0 bg-linear-to-r from-black/85 via-black/50 via-45% to-transparent"
            />
            <div
                class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent"
            />

            <div class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-6">
                <img
                    v-if="logo"
                    :src="logo"
                    :alt="title"
                    class="max-h-20 max-w-[60%] object-contain object-left drop-shadow-lg"
                    @error="logoBroken = true"
                />
                <p
                    v-else
                    class="line-clamp-2 max-w-[75%] font-display text-2xl leading-tight font-bold text-balance"
                >
                    {{ title }}
                </p>

                <div class="flex items-center gap-x-2 text-xs text-white/70">
                    <span
                        v-if="item.averageScore"
                        class="flex items-center gap-1 font-semibold text-white"
                    >
                        <Star :size="11" class="fill-accent text-accent" />
                        {{ item.averageScore }}%
                    </span>
                    <span v-if="item.averageScore" class="text-white/30">•</span>
                    <span>{{ formatLabel(item) }}</span>
                    <template v-if="airing">
                        <span class="text-white/30">•</span>
                        <span class="text-accent">{{ airing }}</span>
                    </template>
                </div>

                <p class="line-clamp-2 max-w-[70%] text-xs leading-relaxed text-white/60">
                    {{ stripHtml(item.description) }}
                </p>

                <button
                    class="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
                    @click.stop="mediaStore.viewMedia(item)"
                >
                    <Play :size="12" fill="currentColor" />
                    {{ $t('common.watchNow') }}
                </button>
            </div>
        </div>

        <div
            :class="[
                'absolute inset-x-0 top-0 flex justify-between p-2 transition-opacity duration-200',
                expanded && 'opacity-0',
            ]"
        >
            <span
                v-if="item.averageScore"
                class="flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm"
            >
                <Star :size="10" class="fill-accent text-accent" />
                {{ item.averageScore }}
            </span>
        </div>
        <span
            v-if="airing"
            :class="[
                'absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm transition-opacity duration-200',
                expanded && 'opacity-0',
            ]"
        >
            {{ airing }}
        </span>
    </div>
</template>
