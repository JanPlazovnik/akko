import { graphql } from './graphql';

export const MediaFragment = graphql(`
    fragment MediaFragment on Media @_unmask {
        id
        idMal
        isAdult
        description
        siteUrl
        coverImage {
            large
            color
        }
        bannerImage
        title {
            romaji
            english
            native
            userPreferred
        }
        format
        status
        episodes
        season
        seasonYear
        averageScore
        startDate {
            year
            month
            day
        }
        endDate {
            year
            month
            day
        }
        genres
        tags {
            name
            rank
            isGeneralSpoiler
            isMediaSpoiler
        }
        type
        relations {
            edges {
                relationType(version: 2)
                node {
                    id
                    title {
                        romaji
                        english
                        userPreferred
                    }
                    type
                    format
                }
            }
        }
    }
`);

// Lighter than MediaFragment: a full list with tags and relation titles is about twice the size
export const ListMediaFragment = graphql(`
    fragment ListMediaFragment on Media @_unmask {
        id
        idMal
        isAdult
        description
        siteUrl
        coverImage {
            large
            color
        }
        bannerImage
        title {
            romaji
            english
            native
            userPreferred
        }
        format
        status
        episodes
        season
        seasonYear
        averageScore
        startDate {
            year
            month
            day
        }
        endDate {
            year
            month
            day
        }
        genres
        type
        nextAiringEpisode {
            episode
            airingAt
        }
        relations {
            edges {
                relationType(version: 2)
                node {
                    id
                    type
                    format
                    status
                }
            }
        }
    }
`);

export const ListEntryFragment = graphql(
    `
        fragment ListEntryFragment on MediaList @_unmask {
            id
            mediaId
            status
            progress
            score
            repeat
            updatedAt
            startedAt {
                year
                month
                day
            }
            completedAt {
                year
                month
                day
            }
            media {
                ...ListMediaFragment
            }
        }
    `,
    [ListMediaFragment]
);
