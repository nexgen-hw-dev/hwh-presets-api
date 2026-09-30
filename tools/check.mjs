// Проверка data/presets.json перед коммитом: node tools/check.mjs
// Формат строки: [ник, тип видео, id видео, урон в млрд, усиление, монеты, [т1, т2], питомец, герои] — см. README.
// Номера героев и покровителей по данным игры здесь не проверить: это делает дополнение, неподходящие сборки
// оно просто не показывает. Здесь — форма данных, ранги, повторы
import { readFileSync } from 'node:fs';

const file = new URL('../data/presets.json', import.meta.url);
const errors = [];
const warnings = [];
let rows;
try {
    rows = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
    console.error('data/presets.json не читается как JSON:', e.message);
    process.exit(1);
}
if (!Array.isArray(rows)) {
    console.error('data/presets.json должен быть массивом сборок');
    process.exit(1);
}

const isInt = (v) => Number.isInteger(v);
const isPet = (v) => isInt(v) && ((v >= 1 && v < 100) || (v >= 6000 && v < 7000));
const petId = (v) => (v > 0 && v < 100 ? 6000 + v : v);
const VIDEO_ID = { 1: /^[\w-]{11}$/ };
const RANKS = [1, 3, 7];
const seen = new Map();

rows.forEach((row, index) => {
    const at = `#${index + 1}`;
    const fail = (text) => errors.push(`${at} ${text}`);
    if (!Array.isArray(row) || row.length < 9) return fail('строка — массив минимум из 9 полей');
    const [nick, videoType, videoId, damage, buff, coins, talismans, pet, heroes] = row;
    const name = `${at} ${nick} ${damage}B`;

    if (typeof nick !== 'string' || !nick.trim() || nick.length > 40) fail('ник — непустая строка до 40 символов');
    if (!isInt(videoType) || videoType < 0) fail('тип видео — целое: 0 нет, 1 YouTube');
    if (videoType === 0 && videoId !== '') fail('без видео id должен быть пустой строкой');
    if (videoType > 0) {
        if (!VIDEO_ID[videoType]) warnings.push(`${name}: тип видео ${videoType} дополнению неизвестен, ссылки не будет`);
        else if (typeof videoId !== 'string' || !VIDEO_ID[videoType].test(videoId)) fail(`id видео не похож на YouTube: ${videoId}`);
    }
    /** Сравнение с допуском: 9.2 × 100 в двоичной дроби — 919.999… */
    if (typeof damage !== 'number' || !(damage > 0) || Math.abs(Math.round(damage * 100) - damage * 100) > 1e-6) fail('урон — число в миллиардах, не больше двух знаков после точки');
    if (!isInt(buff) || buff < 0 || buff > 1000) fail('усиление — целое от 0 до 1000');
    if (!isInt(coins) || coins < 0) fail('монеты — целое, 0 — неизвестно');
    if (!Array.isArray(talismans) || talismans.length !== 2 || !talismans.every((t) => isInt(t) && t > 8000 && t < 9000)) fail('талисманы — два номера вида 80xx');
    else if (talismans[0] === talismans[1]) fail('один и тот же талисман на обе выдачи не дают');
    if (!isPet(pet)) fail('питомец — коротко 1–99 или полный 6000–6999');

    if (!Array.isArray(heroes) || heroes.length === 0 || heroes.length % 3 || heroes.length > 15) {
        return fail('герои — от 1 до 5 троек «герой, ранг, покровитель»');
    }
    const ids = [];
    const patrons = [];
    for (let i = 0; i < heroes.length; i += 3) {
        const [hero, rank, patron] = heroes.slice(i, i + 3);
        if (!isInt(hero) || hero < 1 || hero > 999) fail(`герой ${hero}: номер от 1 до 999`);
        if (!RANKS.includes(rank)) fail(`герой ${hero}: ранг ${rank}, а бывает только 1, 3 или 7`);
        if (patron !== 0 && !isPet(patron)) fail(`герой ${hero}: покровитель ${patron} — 0, коротко 1–99 или полный 6000–6999`);
        if (ids.includes(hero)) fail(`герой ${hero} дважды`);
        if (patron && patrons.includes(petId(patron))) fail(`покровитель ${petId(patron)} у двоих героев`);
        ids.push(hero);
        if (patron) patrons.push(petId(patron));
    }

    /** Одинаковая настройка: те же герои с рангами и покровителями, питомец и талисманы */
    const triples = [];
    for (let i = 0; i < heroes.length; i += 3) triples.push(`${heroes[i]}/${heroes[i + 1]}/${petId(heroes[i + 2]) || 0}`);
    const key = `${triples.sort().join(',')}|${petId(pet)}|${talismans.join(',')}`;
    if (seen.has(key)) warnings.push(`${name}: та же настройка, что у ${seen.get(key)} — отличаются только урон, усиление, монеты или видео`);
    else seen.set(key, name);
});

for (const w of warnings) console.warn('внимание:', w);
if (errors.length) {
    for (const e of errors) console.error('ошибка:', e);
    console.error(`\nсборок ${rows.length}, ошибок ${errors.length}`);
    process.exit(1);
}
console.log(`сборок ${rows.length}, ошибок нет${warnings.length ? `, замечаний ${warnings.length}` : ''}`);
