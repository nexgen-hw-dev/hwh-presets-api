/**
 * GET /api/v1/presets — готовые сборки для HWHArchdemonExt, массив строк в компактном формате (см. README).
 * Данные открытые и только для чтения, без ключей и без данных игрока, поэтому CORS для всех.
 * Кеш: браузер и CDN Netlify держат ответ 2 часа; новый деплой сбрасывает кеш CDN сам
 */

import presets from '../../data/presets.json';

const TWO_HOURS = 7200;
const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${TWO_HOURS}`,
    'Netlify-CDN-Cache-Control': `public, s-maxage=${TWO_HOURS}, stale-while-revalidate=86400`,
};

export default async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' },
        });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { ...HEADERS, Allow: 'GET, HEAD, OPTIONS' } });
    }
    return Response.json(presets, { headers: HEADERS });
};

export const config = { path: '/api/v1/presets' };
