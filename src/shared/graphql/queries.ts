import { MediaFragment } from './fragments';
import { graphql, ResultOf } from './graphql';

export const GetAnimeQuery = graphql(
    `
        query GetAnime($title: String, $id: Int) {
            Media(search: $title, id: $id, type: ANIME) {
                ...MediaFragment
                episodes
                nextAiringEpisode {
                    episode
                    airingAt
                    timeUntilAiring
                }
                trailer {
                    id
                    site
                }
                studios {
                    edges {
                        id
                        isMain
                        node {
                            name
                            siteUrl
                        }
                    }
                }
            }
        }
    `,
    [MediaFragment]
);

export type Media = ResultOf<typeof MediaFragment>;
export type Anime = ResultOf<typeof GetAnimeQuery>['Media'];

export const DashboardQuery = graphql(
    `
        query ($season: MediaSeason, $seasonYear: Int, $nextSeason: MediaSeason, $nextYear: Int) {
            trending: Page(page: 1, perPage: 6) {
                media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
                    ...MediaFragment
                }
            }
            season: Page(page: 1, perPage: 6) {
                media(
                    season: $season
                    seasonYear: $seasonYear
                    sort: POPULARITY_DESC
                    type: ANIME
                    isAdult: false
                ) {
                    ...MediaFragment
                }
            }
            nextSeason: Page(page: 1, perPage: 6) {
                media(
                    season: $nextSeason
                    seasonYear: $nextYear
                    sort: POPULARITY_DESC
                    type: ANIME
                    isAdult: false
                ) {
                    ...MediaFragment
                }
            }
            popular: Page(page: 1, perPage: 6) {
                media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
                    ...MediaFragment
                }
            }
            top: Page(page: 1, perPage: 10) {
                media(sort: SCORE_DESC, type: ANIME, isAdult: false) {
                    ...MediaFragment
                }
            }
        }
    `,
    [MediaFragment]
);
