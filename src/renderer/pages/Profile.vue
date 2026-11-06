<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { UserProfileQuery, type Media, type UserProfile } from '@shared/graphql/queries';
import MediaRow from '../components/MediaRow.vue';
import BrandIcon from '../components/ui/BrandIcon.vue';
import { accentStyle, profileColor } from '../lib/accent';
import { anilistUserQuery, staleWhileRevalidate } from '../lib/anilist';
import { errorMessage } from '../lib/format';
import { createLogger } from '../lib/logger';
import { genreLabel, listLabel } from '../lib/media-labels';
import { i18n, t } from '../i18n';
import { useAccountsStore } from '../stores/accounts';

const log = createLogger('profile');

const MAX_AGE = 30 * 60_000;
const RECENT = 20;
const TOP_GENRES = 6;
const ADULT_GENRE = 'Hentai';

const route = useRoute();
const accounts = useAccountsStore();

// Without an id the page shows the connected account
const userId = computed(() => Number(route.params.id) || accounts.anilist?.id);
const isSelf = computed(() => userId.value === accounts.anilist?.id);

const data = ref<UserProfile | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let request = 0;

async function load(id: number | undefined) {
    const current = ++request;
    data.value = null;
    error.value = null;
    if (!id || !accounts.anilist) return;
    loading.value = true;
    try {
        await staleWhileRevalidate(
            (maxAge) => anilistUserQuery(UserProfileQuery, { id, recent: RECENT }, maxAge),
            MAX_AGE,
            (result) => current === request && (data.value = result)
        );
    } catch (err) {
        if (current !== request) return;
        error.value = errorMessage(err);
        log.warn(`Failed to load profile ${id}:`, err);
    } finally {
        if (current === request) loading.value = false;
    }
}

watch(userId, load, { immediate: true });

const profile = computed(() => data.value?.User ?? null);
const accent = computed(() => accentStyle(profileColor(profile.value?.options?.profileColor)));

const number = (value: number, digits = 0) =>
    value.toLocaleString(i18n.global.locale.value, { maximumFractionDigits: digits });

// Statistics are always out of 100, so they're shown in the connected account's format
const meanScore = (outOf100: number) => (outOf100 * accounts.scoreScale().max) / 100;

const anime = computed(() => profile.value?.statistics?.anime ?? null);

const stats = computed(() => {
    const a = anime.value;
    if (!a) return [];
    return [
        { label: t('profile.anime'), value: number(a.count) },
        { label: t('profile.episodes'), value: number(a.episodesWatched) },
        { label: t('profile.days'), value: number(a.minutesWatched / 1440, 1) },
        a.meanScore
            ? { label: t('profile.meanScore'), value: number(meanScore(a.meanScore), 1) }
            : null,
    ].filter((stat) => stat !== null);
});

// Adult content stays hidden like everywhere else in the app
const genres = computed(() => {
    const ranked = (anime.value?.genres ?? [])
        .filter((g) => g?.genre && g.count && g.genre !== ADULT_GENRE)
        .slice(0, TOP_GENRES);
    const top = ranked[0]?.count ?? 1;
    return ranked.map((g) => ({ genre: g!.genre!, count: g!.count, share: g!.count / top }));
});

const joined = computed(() => {
    const at = profile.value?.createdAt;
    if (!at) return null;
    const date = new Date(at * 1000).toLocaleDateString(i18n.global.locale.value, {
        month: 'long',
        year: 'numeric',
    });
    return t('profile.joined', { date });
});

const relation = computed(() => {
    const user = profile.value;
    if (!user || isSelf.value) return null;
    if (user.isFollower && user.isFollowing) return t('profile.mutuals');
    if (user.isFollower) return t('profile.followsYou');
    if (user.isFollowing) return t('profile.following');
    return null;
});

// ListMediaFragment covers everything a card reads
const asMedia = (media: unknown) => media as Media;

const favourites = computed(() =>
    (profile.value?.favourites?.anime?.nodes ?? []).filter((m) => m && !m.isAdult).map(asMedia)
);

const recent = computed(() =>
    (data.value?.Page?.mediaList ?? []).filter((e) => e?.media && !e.media.isAdult)
);
const recentMedia = computed(() => recent.value.map((e) => asMedia(e!.media)));
const recentLabels = computed(
    () => new Map(recent.value.map((e) => [e!.mediaId, listLabel(e!, e!.media!.episodes)]))
);

const avatar = computed(
    () => profile.value?.avatar?.large ?? (isSelf.value ? accounts.anilist?.avatar : null) ?? null
);
const name = computed(
    () => profile.value?.name ?? (isSelf.value ? accounts.anilist?.name : null) ?? ''
);
</script>

<template>
    <div class="min-h-full pb-16" :style="accent">
        <div
            v-if="!accounts.anilist"
            class="flex flex-col items-center gap-3 px-8 py-24 text-center"
        >
            <p class="font-display text-xl font-semibold">{{ $t('library.connectTitle') }}</p>
            <p class="max-w-sm text-sm text-white/45">{{ $t('library.connectBody') }}</p>
            <RouterLink
                to="/settings"
                class="mt-2 inline-flex h-9 items-center rounded-lg bg-white/8 px-3 text-sm font-medium transition-colors hover:bg-white/14"
            >
                {{ $t('library.connect') }}
            </RouterLink>
        </div>

        <template v-else>
            <section class="relative h-[280px] overflow-hidden bg-raised/60">
                <img
                    v-if="profile?.bannerImage"
                    :src="profile.bannerImage"
                    class="absolute inset-0 size-full object-cover"
                />
                <img
                    v-else-if="avatar"
                    :src="avatar"
                    class="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-3xl"
                />
                <div
                    class="absolute inset-0 bg-linear-to-t from-surface via-surface/30 to-transparent"
                />
            </section>

            <div class="mx-auto max-w-[1440px] px-10">
                <div class="relative -mt-20 flex items-end gap-6">
                    <div
                        class="size-[136px] shrink-0 overflow-hidden rounded-2xl bg-raised shadow-2xl shadow-black/60 ring-4 ring-surface"
                    >
                        <img v-if="avatar" :src="avatar" class="size-full object-cover" />
                    </div>
                    <div class="min-w-0 pb-1">
                        <h1
                            class="truncate font-display text-4xl leading-tight font-bold tracking-tight select-text"
                        >
                            {{ name }}
                        </h1>
                        <div class="mt-1.5 flex items-center gap-3 text-sm text-white/45">
                            <span
                                v-if="relation"
                                class="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
                            >
                                {{ relation }}
                            </span>
                            <span v-if="joined">{{ joined }}</span>
                            <a
                                v-if="profile?.siteUrl"
                                :href="profile.siteUrl"
                                target="_blank"
                                class="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                            >
                                <BrandIcon name="anilist" :size="12" />
                                {{ $t('profile.openOnAnilist') }}
                            </a>
                        </div>
                    </div>
                </div>

                <p v-if="error && !profile" class="mt-8 text-sm">
                    <span class="text-red-400">{{ $t('profile.loadFailed') }}</span>
                    <span class="text-white/45"> {{ error }}</span>
                </p>

                <div v-else class="mt-9 flex flex-col gap-8">
                    <dl class="flex flex-wrap gap-y-4">
                        <template v-if="loading && !profile">
                            <div v-for="i in 4" :key="i" class="pr-10">
                                <div class="h-8 w-20 animate-pulse rounded bg-raised" />
                                <div class="mt-2 h-2.5 w-14 animate-pulse rounded bg-raised" />
                            </div>
                        </template>
                        <div
                            v-for="stat in stats"
                            :key="stat.label"
                            class="border-l border-line px-8 first:border-l-0 first:pl-0"
                        >
                            <dd class="font-display text-3xl font-semibold tabular-nums">
                                {{ stat.value }}
                            </dd>
                            <dt
                                class="mt-0.5 text-[11px] font-semibold tracking-wider text-white/40 uppercase"
                            >
                                {{ stat.label }}
                            </dt>
                        </div>
                    </dl>

                    <div v-if="genres.length">
                        <h2
                            class="mb-3 text-[11px] font-semibold tracking-wider text-white/40 uppercase"
                        >
                            {{ $t('profile.topGenres') }}
                        </h2>
                        <ul class="grid grid-cols-2 gap-x-6 gap-y-1.5 lg:grid-cols-3">
                            <li v-for="g in genres" :key="g.genre">
                                <RouterLink
                                    :to="{ path: '/search', query: { genres: g.genre } }"
                                    class="group relative flex h-7 items-center justify-between overflow-hidden rounded-md px-2.5 text-sm"
                                >
                                    <span
                                        class="absolute inset-y-0 left-0 rounded-md bg-accent/12 transition-colors group-hover:bg-accent/20"
                                        :style="{ width: `${g.share * 100}%` }"
                                    />
                                    <span class="relative text-white/80 group-hover:text-white">
                                        {{ genreLabel(g.genre) }}
                                    </span>
                                    <span class="relative text-xs text-white/40 tabular-nums">
                                        {{ number(g.count) }}
                                    </span>
                                </RouterLink>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="mx-auto max-w-[1440px]">
                <MediaRow
                    :title="$t('profile.recent')"
                    :items="recentMedia"
                    :labels="recentLabels"
                    gutter="px-10"
                />
                <MediaRow :title="$t('profile.favourites')" :items="favourites" gutter="px-10" />
            </div>
        </template>
    </div>
</template>
