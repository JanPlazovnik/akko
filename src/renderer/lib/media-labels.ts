export const STATUS_LABELS: Record<string, string> = {
    RELEASING: 'Airing',
    FINISHED: 'Finished',
    NOT_YET_RELEASED: 'Not Yet Released',
    CANCELLED: 'Cancelled',
    HIATUS: 'On Hiatus',
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
