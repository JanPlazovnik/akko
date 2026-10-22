// Title logos and backdrops for akko's home banner. Keeps the TMDB token server side and caches
// every answer.

interface Env {
    TMDB_TOKEN: string;
}

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

type TmdbImage = {
    file_path: string;
    iso_639_1: string | null;
    aspect_ratio: number;
    vote_average: number;
};

const DAY_S = 24 * 60 * 60;
const FOUND_TTL_S = 30 * DAY_S;
const MISSING_TTL_S = DAY_S;
// Square or tall logos don't fit the banner's title slot
const MIN_ASPECT_RATIO = 1.2;

type Art = { logo: string | null; backdrop: string | null };

function json(body: unknown, status = 200, maxAge = 0): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
            'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
        },
    });
}

async function tmdbTarget(anilistId: number): Promise<string | null> {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ani.zip responded ${res.status}`);
    const { mappings } = (await res.json()) as {
        mappings?: { themoviedb_id?: string | number | null; type?: string | null };
    };
    if (!mappings?.themoviedb_id) return null;
    const kind = mappings.type === 'MOVIE' ? 'movie' : 'tv';
    return `${kind}/${mappings.themoviedb_id}`;
}

const byVotes = (a: TmdbImage, b: TmdbImage) => b.vote_average - a.vote_average;

// Backdrops without text come first, since the banner puts its own title over them
async function findArt(anilistId: number, env: Env): Promise<Art> {
    const none: Art = { logo: null, backdrop: null };
    const target = await tmdbTarget(anilistId);
    if (!target) return none;
    const res = await fetch(
        `https://api.themoviedb.org/3/${target}/images?include_image_language=en,null`,
        { headers: { authorization: `Bearer ${env.TMDB_TOKEN}` } }
    );
    if (res.status === 404) return none;
    if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
    const { logos = [], backdrops = [] } = (await res.json()) as {
        logos?: TmdbImage[];
        backdrops?: TmdbImage[];
    };
    const logo = logos
        .filter((image) => image.iso_639_1 === 'en' && image.aspect_ratio >= MIN_ASPECT_RATIO)
        .sort(byVotes)[0];
    const backdrop =
        backdrops.filter((image) => !image.iso_639_1).sort(byVotes)[0] ??
        backdrops.sort(byVotes)[0];
    return {
        logo: logo ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : null,
        backdrop: backdrop ? `https://image.tmdb.org/t/p/w1280${backdrop.file_path}` : null,
    };
}

// /logo is what older app versions ask for
const ROUTES: Record<string, (art: Art) => unknown> = {
    '/logo': ({ logo }) => ({ logo }),
    '/art': (art) => art,
};

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const route = ROUTES[url.pathname];
        if (request.method !== 'GET' || !route) {
            return json({ error: 'Not found' }, 404);
        }
        const anilistId = Number(url.searchParams.get('anilist_id'));
        if (!Number.isInteger(anilistId) || anilistId <= 0) {
            return json({ error: 'anilist_id must be a positive integer' }, 400);
        }

        const cache = await caches.open('logos');
        const key = new Request(`${url.origin}${url.pathname}?anilist_id=${anilistId}`);
        const hit = await cache.match(key);
        if (hit) return hit;

        try {
            const art = await findArt(anilistId, env);
            const found = url.pathname === '/logo' ? art.logo : art.logo || art.backdrop;
            const response = json(route(art), 200, found ? FOUND_TTL_S : MISSING_TTL_S);
            ctx.waitUntil(cache.put(key, response.clone()));
            return response;
        } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) }, 502);
        }
    },
};
