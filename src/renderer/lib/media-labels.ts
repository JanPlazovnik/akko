export const STATUS_LABELS: Record<string, string> = {
    RELEASING: 'Airing',
    FINISHED: 'Finished',
    NOT_YET_RELEASED: 'Not Yet Released',
    CANCELLED: 'Cancelled',
    HIATUS: 'On Hiatus',
};

export const LIST_STATUS_LABELS: Record<string, string> = {
    CURRENT: 'Watching',
    REPEATING: 'Rewatching',
    PLANNING: 'Planning',
    COMPLETED: 'Completed',
    PAUSED: 'Paused',
    DROPPED: 'Dropped',
};

type ListSource = {
    status?: string | null;
    progress?: number | null;
    media?: { episodes?: number | null } | null;
};

export function listLabel({ status, progress, media }: ListSource): string {
    const label = LIST_STATUS_LABELS[status ?? ''] ?? status ?? '';
    if (!progress || status === 'COMPLETED' || status === 'PLANNING') return label;
    return `${label} · ${progress}/${media?.episodes ?? '?'}`;
}

// Ordered by how likely you are to watch it next
export const RELATION_LABELS: Record<string, string> = {
    SEQUEL: 'Sequel',
    PREQUEL: 'Prequel',
    PARENT: 'Parent story',
    SIDE_STORY: 'Side story',
    SPIN_OFF: 'Spin-off',
    ALTERNATIVE: 'Alternative',
    SUMMARY: 'Summary',
    COMPILATION: 'Compilation',
    CONTAINS: 'Contains',
    OTHER: 'Other',
    CHARACTER: 'Shared characters',
};

export const FORMAT_LABELS: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music',
    MANGA: 'Manga',
    NOVEL: 'Novel',
    ONE_SHOT: 'One Shot',
};

export const SEASON_LABELS: Record<string, string> = {
    WINTER: 'Winter',
    SPRING: 'Spring',
    SUMMER: 'Summer',
    FALL: 'Fall',
};

type MetaSource = {
    format?: string | null;
    episodes?: number | null;
    season?: string | null;
    seasonYear?: number | null;
    startDate?: { year?: number | null } | null;
};

export function mediaMeta(media: MetaSource): string[] {
    const season =
        media.season && media.seasonYear
            ? `${SEASON_LABELS[media.season] ?? media.season} ${media.seasonYear}`
            : media.startDate?.year && String(media.startDate.year);
    return [
        media.format && (FORMAT_LABELS[media.format] ?? media.format),
        media.episodes && `${media.episodes} ${media.episodes === 1 ? 'episode' : 'episodes'}`,
        season,
    ].filter((part): part is string => Boolean(part));
}

export function stripHtml(value?: string | null): string {
    return value?.replace(/<[^>]*>/g, '') ?? '';
}
