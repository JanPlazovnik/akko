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
