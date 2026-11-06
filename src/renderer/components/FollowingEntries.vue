<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { Star } from '@lucide/vue';
import { profileColor } from '../lib/accent';
import { useFollowingEntries } from '../lib/following';
import { listLabel } from '../lib/media-labels';
import { useAccountsStore } from '../stores/accounts';
import { useMediaStore } from '../stores/media';

const COLLAPSED = 6;

const props = defineProps<{ mediaId: number }>();

const accounts = useAccountsStore();
const mediaStore = useMediaStore();
const entries = useFollowingEntries(toRef(props, 'mediaId'));
const expanded = ref(false);
watch(
    () => props.mediaId,
    () => (expanded.value = false)
);

const shown = computed(() => (expanded.value ? entries.value : entries.value.slice(0, COLLAPSED)));
const hidden = computed(() => entries.value.length - shown.value.length);
const episodeTotal = computed(() => mediaStore.episodeTotal(props.mediaId));
const scoreMax = computed(() => accounts.scoreScale().max);
</script>

<template>
    <div v-if="entries.length" class="mt-6">
        <h2 class="mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">
            {{ $t('mediaInfo.following') }}
        </h2>
        <div class="flex flex-wrap items-center gap-2">
            <RouterLink
                v-for="entry in shown"
                :key="entry.id"
                :to="`/profile/${entry.user!.id}`"
                :title="entry.user!.isFollower ? $t('mediaInfo.mutual') : undefined"
                class="flex h-9 items-center gap-2 rounded-full whitespace-nowrap bg-white/5 pr-3 pl-1 ring-1 ring-line transition-colors hover:bg-white/10"
            >
                <img
                    v-if="entry.user!.avatar?.medium"
                    :src="entry.user!.avatar.medium"
                    class="size-7 rounded-full bg-raised object-cover ring-2 ring-white/10"
                    :style="{ '--tw-ring-color': profileColor(entry.user!.options?.profileColor) }"
                />
                <span class="text-sm font-medium text-white/85">{{ entry.user!.name }}</span>
                <span class="text-xs text-white/40">{{ listLabel(entry, episodeTotal) }}</span>
                <span
                    v-if="entry.score"
                    class="flex items-center gap-0.5 text-xs text-white/60 tabular-nums"
                    :title="$t('mediaInfo.scoreOutOf', { score: entry.score, max: scoreMax })"
                >
                    <Star :size="11" class="-mt-px fill-accent text-accent" />
                    {{ entry.score }}
                </span>
            </RouterLink>
            <button
                v-if="hidden > 0"
                class="h-9 cursor-pointer rounded-full px-3 text-xs font-semibold text-white/50 transition-colors hover:bg-white/8 hover:text-white"
                @click="expanded = true"
            >
                {{ $t('mediaInfo.moreFollowing', { n: hidden }) }}
            </button>
        </div>
    </div>
</template>
