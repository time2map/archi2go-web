import { env } from '@shared/config/env';
import type { PlaceCategory } from '../places';

export const MAPBOX_TOKEN = env.mapboxAccessToken;
export const MAPBOX_STYLE = env.mapboxStyle;
export const CONTACT_FORM_ENDPOINT = env.contactFormEndpoint;
export const CONTACT_EMAIL = 'contact@time2map.com';

export const CITY_ZOOM = 12.35;
export const PLACE_ZOOM = 13.9;
export const PLACE_3D_ZOOM = 16.4;
export const PLACE_3D_ZOOM_MOBILE = 15.4;
export const PLACE_3D_PITCH = 62;
// Pitch raises the horizon. The camera cannot tilt past this, including the phone gesture.
export const MAP_MAX_PITCH = 65;
export const PLACE_3D_BEARING = -20;
export const PLACE_ORBIT_DURATION = 36_000;
export const COMPACT_PIN_ZOOM = 13;
// Compact marker palette: switch to 'category' to use a muted colour per place type.
export const COMPACT_MARKER_MODE = 'neutral' as 'neutral' | 'category';
// Square overview pins: 'light' = white fill + black border; 'dark' = black fill + white border.
export const DOT_PIN_STYLE = 'dark' as 'light' | 'dark';
// Photo pins per viewport; the rest of the places in view render as dots.
export const MAX_PHOTO_PINS = 10;
// Marker photo square edge in CSS px (1.5× the original 44).
export const PHOTO_PIN_SIZE = 66;
// From this zoom every place in view is a photo pin, overlap included.
export const PHOTO_PIN_ALWAYS_ZOOM = 15;
export const PHOTO_PIN_GAP = 6;
export const HOVER_PREVIEW_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 820px)';
export const BUILDINGS_3D_MIN_ZOOM = 15.2;
// Mapbox Standard POI labels stay off at city overview so curated pins stay primary.
export const POI_LABELS_MIN_ZOOM = 16;
export const BUILDINGS_3D_STORAGE_KEY = 'archi2go-3d-v2';
export const MOBILE_QUERY_WIDTH = 820;
export const LIGHTBOX_WIDTH = 1920;
export const SHORTCUT_MODIFIER =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
// true: cities and places come from the backend API; false: from the bundled files in src/top.
export const USE_BACKEND = true;
export const CITY_STORAGE_KEY = 'archi2go-city-v2';
export const TIME2MAP_URL = 'https://time2map.com/';

export type CategoryFilter = 'all' | PlaceCategory;
export type MapViewportBounds = { west: number; south: number; east: number; north: number };
export type SheetLevel = 'peek' | 'half' | 'full';
export type SheetHeights = Record<SheetLevel, number>;
export type IconName =
  | 'arrow-left'
  | 'arrow-up-right'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'external'
  | 'location'
  | 'menu'
  | 'message'
  | 'search';

export const SHEET_LEVELS: SheetLevel[] = ['peek', 'half', 'full'];

export const FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'city-core', label: 'City core' },
  { value: 'housing', label: 'Housing' },
  { value: 'parks', label: 'Parks' },
  { value: 'unusual', label: 'Unusual' },
  { value: 'all', label: 'All' }
];

export function readPreviewLoading() {
  const value = new URLSearchParams(window.location.search).get('loading');
  return value !== null && value !== '0' && value !== 'false' && value !== 'off';
}
