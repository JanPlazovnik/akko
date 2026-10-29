import { t, translateOr } from '../i18n';

const label = (group: string, value: string) => translateOr(`media.${group}.${value}`, value);

export const statusLabel = (status: string) => label('status', status);
export const listStatusLabel = (status: string) => label('listStatus', status);
export const relationLabel = (relation: string) => label('relation', relation);
export const genreLabel = (genre: string) => label('genre', genre);
export const seasonName = (season: string) => label('season', season);

// Ordered by how likely you are to watch it next
export const RELATIONS = [
    'SEQUEL',
    'PREQUEL',
    'PARENT',
    'SIDE_STORY',
    'SPIN_OFF',
    'ALTERNATIVE',
    'SUMMARY',
    'COMPILATION',
    'CONTAINS',
    'OTHER',
    'CHARACTER',
];

type ListSource = {
    status?: string | null;
    progress?: number | null;
};

export function listLabel({ status, progress }: ListSource, total?: number | null): string {
    const name = listStatusLabel(status ?? '');
    if (!progress || status === 'COMPLETED' || status === 'PLANNING') return name;
    return t('media.listProgress', { status: name, progress, total: total ?? '?' });
}

type MetaSource = {
    format?: string | null;
    episodes?: number | null;
    season?: string | null;
    seasonYear?: number | null;
    startDate?: { year?: number | null } | null;
};

export const seasonLabel = (media: MetaSource) =>
    media.season && media.seasonYear
        ? t('media.seasonYear', { season: seasonName(media.season), year: media.seasonYear })
        : media.startDate?.year && String(media.startDate.year);

export const formatLabel = (media: MetaSource) => media.format && label('format', media.format);

const present = (parts: (string | number | null | undefined)[]) =>
    parts.filter((part): part is string => Boolean(part));

export function mediaMeta(media: MetaSource): string[] {
    return present([
        formatLabel(media),
        media.episodes && t('media.episodeCount', { n: media.episodes }, media.episodes),
        seasonLabel(media),
    ]);
}

export function stripHtml(value?: string | null): string {
    return value?.replace(/<[^>]*>/g, '') ?? '';
}
