// Проверка data/presets.json перед коммитом: node tools/check.mjs
// Формат строки: [ник, тип видео, id видео, урон в млрд, усиление, монеты, [т1, т2], питомец, герои, стратегия, глава] —
// см. README. Стратегия и глава необязательны: глава без стратегии — null на месте стратегии. Общая стратегия события —
// элемент { strategy: [...] }, не больше одного.
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
/** Наибольшая точка слива и глава, с HWHArchdemonExt 1.23 и 1.25; до 1.23 точка была только 5 или 7 */
const MAX_POINT = 20;
const MAX_CHAPTER = 20;
/** Неизвестные карты на точке 1: не брать, только дешевле продажи, все */
const CARDS = ['none', 'cheap', 'any'];
/** Предохранители дополнения на обновления: запас на точке 1 и ради героя для слива */
const MAX_REFRESHES = 30;
const FIELDS = ['buff', 'carry', 'sacrifice', 'point', 'chapters', 'cards', 'reserve', 'refreshes'];
const isChapter = (v) => isInt(v) && v >= 1 && v <= MAX_CHAPTER;

/**
 * Ошибки стратегии: { buff: [от, до], carry: [герой, ранг, …], sacrifice: герой или [герои], point: точка слива,
 * chapters, cards, reserve, refreshes } — последние четыре необязательны
 */
function strategyErrors(raw) {
    const out = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['стратегия — объект { buff, carry, sacrifice, point }'];
    const { buff, carry, sacrifice, point, chapters, cards, reserve, refreshes } = raw;
    const extra = Object.keys(raw).filter((k) => !FIELDS.includes(k));
    if (extra.length) out.push(`лишние поля стратегии: ${extra.join(', ')}`);
    if (!Array.isArray(buff) || buff.length !== 2 || !buff.every(isInt) || buff[0] < 0 || buff[0] > buff[1] || buff[1] > 1000) {
        out.push('buff — [от, до], целые 0–1000, от не больше до');
    }
    if (!Array.isArray(carry) || !carry.length || carry.length % 2 || carry.length > 10) {
        out.push('carry — от одной до пяти пар «герой, ранг»');
    } else {
        const ids = [];
        for (let i = 0; i < carry.length; i += 2) {
            const [hero, rank] = carry.slice(i, i + 2);
            if (!isInt(hero) || hero < 1 || hero > 999) out.push(`проходной ${hero}: номер от 1 до 999`);
            if (!RANKS.includes(rank)) out.push(`проходной ${hero}: ранг ${rank}, а бывает только 1, 3 или 7`);
            if (ids.includes(hero)) out.push(`проходной ${hero} дважды`);
            ids.push(hero);
        }
    }
    const sac = Array.isArray(sacrifice) ? sacrifice : [sacrifice];
    if (!sac.length || sac.length > 5 || !sac.every((h) => isInt(h) && h >= 1 && h <= 999) || new Set(sac).size !== sac.length) {
        out.push('sacrifice — номер героя или список до пяти разных');
    }
    if (!isInt(point) || point < 1 || point > MAX_POINT) out.push(`point — точка слива, целое от 1 до ${MAX_POINT}`);
    if (chapters !== undefined && (!Array.isArray(chapters) || !chapters.every(isChapter) || new Set(chapters).size !== chapters.length)) {
        out.push(`chapters — список разных глав от 1 до ${MAX_CHAPTER}; нет поля — для любой главы`);
    }
    if (cards !== undefined && !CARDS.includes(cards)) out.push('cards — none, cheap или any; нет поля — none');
    for (const [name, value] of [['reserve', reserve], ['refreshes', refreshes]]) {
        if (value !== undefined && (!isInt(value) || value < 0 || value > MAX_REFRESHES)) out.push(`${name} — целое от 0 до ${MAX_REFRESHES}; нет поля — 0`);
    }
    return out;
}

let eventStrategies = 0;
rows.forEach((row, index) => {
    const at = `#${index + 1}`;
    const fail = (text) => errors.push(`${at} ${text}`);
    if (row && typeof row === 'object' && !Array.isArray(row)) {
        if (!('strategy' in row) || Object.keys(row).length !== 1) return fail('кроме сборок в массиве бывает только { strategy: [...] }');
        if (++eventStrategies > 1) fail('общая стратегия события — одна на файл');
        if (!Array.isArray(row.strategy) || !row.strategy.length) return fail('strategy — непустой массив стратегий');
        row.strategy.forEach((s, i) => strategyErrors(s).forEach((e) => fail(`общая стратегия ${i + 1}: ${e}`)));
        const ranges = row.strategy.filter((s) => Array.isArray(s?.buff)).map((s) => s.buff).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < ranges.length; i++) {
            if (ranges[i][0] <= ranges[i - 1][1]) warnings.push(`${at}: диапазоны общей стратегии пересекаются, ${ranges[i - 1].join('–')} и ${ranges[i].join('–')} — возьмётся первая по списку`);
        }
        return;
    }
    if (!Array.isArray(row) || row.length < 9 || row.length > 11) return fail('строка — массив из 9 полей, 10 со стратегией или 11 с главой');
    const [nick, videoType, videoId, damage, buff, coins, talismans, pet, heroes, strategy, chapter] = row;
    if (row.length >= 10 && strategy !== null) strategyErrors(strategy).forEach((e) => fail(e));
    if (row.length === 10 && strategy === null) fail('null на месте стратегии — только перед главой');
    if (row.length === 11 && !isChapter(chapter)) fail(`глава — номер по порядку среди глав события, от 1 до ${MAX_CHAPTER}`);
    const name = `${at} ${nick || 'автор неизвестен'} ${damage}B`;

    /** Пустой ник — автор неизвестен, в окне так и пишется */
    if (typeof nick !== 'string' || nick.length > 40 || (nick !== '' && !nick.trim())) fail('ник — строка до 40 символов, пустая — автор неизвестен');
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
    if (pet !== 0 && !isPet(pet)) fail('питомец — 0 без питомца, коротко 1–99 или полный 6000–6999');

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
    console.error(`\nсборок ${rows.length - eventStrategies}, ошибок ${errors.length}`);
    process.exit(1);
}
console.log(`сборок ${rows.length - eventStrategies}, общая стратегия ${eventStrategies ? 'есть' : 'нет'}, ошибок нет${warnings.length ? `, замечаний ${warnings.length}` : ''}`);
