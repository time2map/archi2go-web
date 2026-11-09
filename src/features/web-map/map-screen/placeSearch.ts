import type { CuratedPlace } from '../places';
import type { CategoryFilter } from './config';

/**
 * What the list shows for a query, top to bottom. The list is never empty for a city that has places:
 * whatever the query misses is topped up with places worth seeing.
 *
 * - `matches`: places that contain the query, inside the selected category.
 * - `other-categories`: the same query matched in the other categories.
 * - `similar`: no exact match anywhere; the closest names (typos, partial words).
 * - `recommended`: the city's own picks, only to fill a short or empty result.
 */
export type SearchSectionKind = 'matches' | 'other-categories' | 'similar' | 'recommended';
export type SearchSection = { kind: SearchSectionKind; places: CuratedPlace[] };
/** `matches`: found in the category; `other-categories`: only elsewhere; `similar`: close names; `none`: nothing. */
export type SearchStatus = 'matches' | 'other-categories' | 'similar' | 'none';
export type PlaceSearchResult = {
  status: SearchStatus;
  sections: SearchSection[];
  /** Every place shown, in order. This is also what the map draws. */
  places: CuratedPlace[];
  /** Places that actually answer the query. Recommendations are not counted. */
  matchCount: number;
};

// Up to this many answers the list also offers recommendations, so a thin result never ends the panel.
const RECOMMEND_WHEN_MATCHES_AT_MOST = 10;
const RECOMMENDED_LIMIT = 6;
const OTHER_CATEGORIES_LIMIT = 10;
const SIMILAR_LIMIT = 6;
const SIMILAR_MIN_SCORE = 0.55;
const SIMILAR_MIN_QUERY = 3;

/**
 * Lowercase, strip accents, and collapse punctuation so "Musée" and "musee" compare equal.
 * Letters of every script survive: a Cyrillic or Georgian query folds to itself, not to nothing,
 * so it cannot be mistaken for an empty query that matches every place.
 */
function fold(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchFields(place: CuratedPlace) {
  return [place.title, place.architect, place.area, place.year, place.type].filter(
    (value): value is string => Boolean(value)
  );
}

export function placeMatchesQuery(place: CuratedPlace, query: string) {
  const needle = fold(query);
  // Only punctuation ("???") says nothing, so it matches nothing; a blank query is handled before this.
  if (!needle) return false;
  const compactNeedle = needle.replace(/ /g, '');
  return searchFields(place).some((value) => {
    const folded = fold(value);
    if (folded.includes(needle)) return true;
    // "notredame" still matches "Notre-Dame" once spaces and hyphens are gone.
    return compactNeedle.length >= SIMILAR_MIN_QUERY && folded.replace(/ /g, '').includes(compactNeedle);
  });
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    const left = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = left === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current.slice();
  }
  return previous[b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function fieldScore(queryWords: string[], field: string, wordCounts: Map<string, number>, placeCount: number) {
  const fieldWords = fold(field).split(' ').filter((word) => word.length > 1);
  if (!fieldWords.length) return 0;

  let total = 0;
  for (const queryWord of queryWords) {
    let best = 0;
    for (const fieldWord of fieldWords) {
      const shorter = Math.min(queryWord.length, fieldWord.length);
      const longer = Math.max(queryWord.length, fieldWord.length);
      const prefixed = fieldWord.startsWith(queryWord) || queryWord.startsWith(fieldWord);
      let score = 0;
      if (prefixed) score = shorter / longer;
      // A one-letter miss ("eifel" / "eiffel") counts. The same distance on a short word
      // ("parks" / "paris") does not, or a city name would fill the suggestions.
      if (Math.abs(fieldWord.length - queryWord.length) <= 2 && longer >= 6 && longer <= 24) {
        score = Math.max(score, similarity(queryWord, fieldWord));
      }
      // "parks" is one edit from "paris", which is on almost every card. A shared city word
      // only counts when the query actually starts that word, not when it is a near-miss.
      const common = placeCount > 0 && (wordCounts.get(fieldWord) ?? 0) / placeCount > 0.2;
      if (common && !prefixed) score *= 0.45;
      best = Math.max(best, score);
    }
    // One unrelated word ("eiffel banana") should not ride along on the other word.
    if (best < 0.4) return 0;
    total += best;
  }

  const compactQuery = queryWords.join('');
  const compactField = fieldWords.join('');
  const whole =
    compactQuery.length >= SIMILAR_MIN_QUERY &&
    compactField.length <= 48 &&
    Math.abs(compactQuery.length - compactField.length) <= 3
      ? similarity(compactQuery, compactField)
      : 0;
  return Math.max(total / queryWords.length, whole);
}

function placeScore(place: CuratedPlace, queryWords: string[], wordCounts: Map<string, number>, placeCount: number) {
  return searchFields(place).reduce(
    (best, field) => Math.max(best, fieldScore(queryWords, field, wordCounts, placeCount)),
    0
  );
}

function wordCounts(places: CuratedPlace[]) {
  const counts = new Map<string, number>();
  for (const place of places) {
    const seen = new Set<string>();
    for (const field of searchFields(place)) {
      for (const word of fold(field).split(' ').filter((word) => word.length > 1)) seen.add(word);
    }
    for (const word of seen) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

/** Places that are not an exact match, ranked by how close a title, architect, area, or year is. */
export function similarPlaces(places: CuratedPlace[], query: string) {
  const folded = fold(query);
  const compact = folded.replace(/ /g, '');
  // A missed year should not surface every nearby year. Names and places are the fuzzy case.
  if (compact.length < SIMILAR_MIN_QUERY || /^\d+$/.test(compact)) return [];

  const queryWords = folded.split(' ').filter((word) => word.length > 1);
  if (!queryWords.length) return [];

  const counts = wordCounts(places);
  return places
    .map((place) => ({ place, score: placeScore(place, queryWords, counts, places.length) }))
    .filter((entry) => entry.score >= SIMILAR_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.place.title.localeCompare(b.place.title))
    .slice(0, SIMILAR_LIMIT)
    .map((entry) => entry.place);
}

function recommendedPlaces(places: CuratedPlace[], shown: Set<string>, category: CategoryFilter) {
  // Photos make a card worth the click, and the active category is what the visitor was just looking at.
  // Original order breaks ties, so the city's own curation still decides.
  const rank = (place: CuratedPlace) =>
    (place.photo || place.photos.length ? 0 : 2) + (category === 'all' || place.category === category ? 0 : 1);
  return places
    .map((place, index) => ({ place, index, rank: rank(place) }))
    .filter((entry) => !shown.has(entry.place.id))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, RECOMMENDED_LIMIT)
    .map((entry) => entry.place);
}

function buildResult(
  places: CuratedPlace[],
  category: CategoryFilter,
  status: SearchStatus,
  answers: SearchSection[]
): PlaceSearchResult {
  const sections = answers.filter((section) => section.places.length);
  const matchCount = sections.reduce((total, section) => total + section.places.length, 0);
  if (matchCount <= RECOMMEND_WHEN_MATCHES_AT_MOST) {
    const shown = new Set(sections.flatMap((section) => section.places.map((place) => place.id)));
    const recommended = recommendedPlaces(places, shown, category);
    if (recommended.length) sections.push({ kind: 'recommended', places: recommended });
  }
  return { status, sections, places: sections.flatMap((section) => section.places), matchCount };
}

/**
 * The selected category is searched first. A short answer is then widened to the other categories,
 * a query with no exact match anywhere falls back to the closest names, and a thin or hopeless result
 * is topped up with the city's recommendations. The panel is only empty for a city without places.
 */
export function resolvePlaceSearch(places: CuratedPlace[], query: string, category: CategoryFilter): PlaceSearchResult {
  const needle = query.trim();
  const inCategory = (place: CuratedPlace) => category === 'all' || place.category === category;
  if (!needle) {
    const all = places.filter(inCategory);
    return { status: 'matches', sections: [{ kind: 'matches', places: all }], places: all, matchCount: all.length };
  }

  const exact = places.filter((place) => placeMatchesQuery(place, needle));
  const inside = exact.filter(inCategory);
  const outside = exact.filter((place) => !inCategory(place));

  if (inside.length) {
    const wide = inside.length <= RECOMMEND_WHEN_MATCHES_AT_MOST ? outside.slice(0, OTHER_CATEGORIES_LIMIT) : [];
    return buildResult(places, category, 'matches', [
      { kind: 'matches', places: inside },
      { kind: 'other-categories', places: wide }
    ]);
  }
  if (outside.length) {
    return buildResult(places, category, 'other-categories', [{ kind: 'other-categories', places: outside }]);
  }

  const similar = similarPlaces(places, needle);
  if (similar.length) return buildResult(places, category, 'similar', [{ kind: 'similar', places: similar }]);
  return buildResult(places, category, 'none', []);
}
