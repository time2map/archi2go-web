import type { CuratedCity, CuratedPlace, PlacePhoto, PlaceSource } from '../places';
import { LIGHTBOX_WIDTH } from './config';

export function uniqueSources(sources: PlaceSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.publisher.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A Wikimedia thumb ends in `/<width>px-<name>`, sometimes after a page prefix such as `lossy-page1-`.
const WIKIMEDIA_THUMB = /(\/thumb\/.+\/(?:[a-z]+-)?(?:page\d+-)?)\d+px-([^/?#]+)$/;

// The same thumb at another width, on the host the API gave. Originals and Flickr photos have none.
function resizeThumb(url: string, width: number) {
  return WIKIMEDIA_THUMB.test(url) ? url.replace(WIKIMEDIA_THUMB, `$1${width}px-$2`) : null;
}

// Wikimedia only renders a fixed set of thumbnail widths; 1920 is one of them.
// A narrower original comes back scaled up. If the host refuses, the lightbox falls back to `src`.
export function largePhotoUrl(photo: PlacePhoto) {
  return resizeThumb(photo.src || photo.thumb, LIGHTBOX_WIDTH);
}

// List cards are ~220-290 CSS px wide, so 500px stays sharp on 2x screens without pulling a large file.
// 500 is one of the widths Wikimedia actually serves.
export function listPhotoUrl(photo: PlacePhoto) {
  const source = photo.src || photo.thumb;
  return resizeThumb(source, 500) ?? source;
}

export function googleMapsUrl(place: CuratedPlace) {
  return `https://www.google.com/maps/search/?api=1&query=${place.coordinates[1]},${place.coordinates[0]}`;
}

export function commonsSearchUrl(place: CuratedPlace, city: CuratedCity) {
  return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(`${place.title} ${city.name}`)}&title=Special:MediaSearch&type=image`;
}
