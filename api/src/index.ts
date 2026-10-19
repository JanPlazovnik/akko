// Title logos for akko's home banner. Keeps the TMDB token server side and caches every answer.

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

async function findLogo(anilistId: number, env: Env): Promise<string | null> {
    const target = await tmdbTarget(anilistId);
    if (!target) return null;
    const res = await fetch(
        `https://api.themoviedb.org/3/${target}/images?include_image_language=en`,
        { headers: { authorization: `Bearer ${env.TMDB_TOKEN}` } }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
    const { logos = [] } = (await res.json()) as { logos?: TmdbImage[] };
    const best = logos
        .filter((logo) => logo.iso_639_1 === 'en' && logo.aspect_ratio >= MIN_ASPECT_RATIO)
        .sort((a, b) => b.vote_average - a.vote_average)[0];
    return best ? `https://image.tmdb.org/t/p/w500${best.file_path}` : null;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        if (request.method !== 'GET' || url.pathname !== '/logo') {
            return json({ error: 'Not found' }, 404);
        }
        const anilistId = Number(url.searchParams.get('anilist_id'));
        if (!Number.isInteger(anilistId) || anilistId <= 0) {
            return json({ error: 'anilist_id must be a positive integer' }, 400);
        }

        const cache = await caches.open('logos');
        const key = new Request(`${url.origin}/logo?anilist_id=${anilistId}`);
        const hit = await cache.match(key);
        if (hit) return hit;

        try {
            const logo = await findLogo(anilistId, env);
            const response = json({ logo }, 200, logo ? FOUND_TTL_S : MISSING_TTL_S);
            ctx.waitUntil(cache.put(key, response.clone()));
            return response;
        } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) }, 502);
        }
    },
};
