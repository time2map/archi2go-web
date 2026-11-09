import type { Map as MapboxMap } from 'mapbox-gl';
import type { CuratedPlace } from '../places';
import {
  CITY_ZOOM,
  COMPACT_PIN_ZOOM,
  MAX_PHOTO_PINS,
  PHOTO_PIN_ALWAYS_ZOOM,
  MOBILE_QUERY_WIDTH,
  PHOTO_PIN_GAP,
  PHOTO_PIN_SIZE,
  PLACE_3D_BEARING,
  PLACE_3D_PITCH,
  PLACE_3D_ZOOM,
  PLACE_3D_ZOOM_MOBILE,
  PLACE_ORBIT_DURATION,
  PLACE_ZOOM,
  type MapViewportBounds,
  type SheetHeights,
  type SheetLevel
} from './config';

export function getSheetHeights(viewportHeight: number): SheetHeights {
  if (viewportHeight < 520) {
    return { peek: 124, half: Math.max(124, Math.min(220, viewportHeight - 120)), full: viewportHeight - 16 };
  }
  return {
    peek: 132,
    half: Math.min(520, Math.max(300, Math.round(viewportHeight * 0.5))),
    full: viewportHeight - 64
  };
}

// The map stays usable behind a full sheet, so camera padding never exceeds the half sheet.
export function sheetMapPadding(level: SheetLevel, heights: SheetHeights) {
  return Math.min(heights[level], heights.half);
}

let mobileSheetPadding: number | null = null;

export function setMobileSheetPadding(padding: number | null) {
  mobileSheetPadding = padding;
}

export function getMapPadding() {
  if (window.innerWidth < MOBILE_QUERY_WIDTH) {
    return {
      top: 24,
      right: 16,
      bottom: mobileSheetPadding ?? sheetMapPadding('half', getSheetHeights(window.innerHeight)),
      left: 16
    };
  }
  return { top: 32, right: 32, bottom: 32, left: getSidebarWidth() + 16 };
}

// Mirrors `--v2-sidebar: clamp(480px, 40vw, 640px)` in design-two.css, so the camera
// centres on the visible map strip even before the sidebar has mounted.
export function getSidebarWidth() {
  return Math.min(640, Math.max(480, Math.round(window.innerWidth * 0.4)));
}

// Padding moves the camera's focal point; re-centre so whatever is on screen stays put.
export function setPaddingKeepingView(map: MapboxMap, padding: ReturnType<typeof getMapPadding>) {
  const container = map.getContainer();
  const x = (padding.left + container.clientWidth - padding.right) / 2;
  const y = (padding.top + container.clientHeight - padding.bottom) / 2;
  map.jumpTo({ center: map.unproject([x, y]), padding });
}

// The mobile map strip above the sheet is short, so the desktop zoom crops the surroundings.
export function getPlace3dZoom() {
  return window.innerWidth < MOBILE_QUERY_WIDTH ? PLACE_3D_ZOOM_MOBILE : PLACE_3D_ZOOM;
}

// map.getBounds() only covers the area inside the camera padding, which on mobile
// excludes everything behind the sheet, so use the whole container instead.
export function getBufferedMapBounds(map: MapboxMap): MapViewportBounds | null {
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return null;
  const corners = [
    map.unproject([0, 0]),
    map.unproject([width, 0]),
    map.unproject([0, height]),
    map.unproject([width, height])
  ];
  const west = Math.min(...corners.map((corner) => corner.lng));
  const east = Math.max(...corners.map((corner) => corner.lng));
  const south = Math.min(...corners.map((corner) => corner.lat));
  const north = Math.max(...corners.map((corner) => corner.lat));
  const longitudePadding = (east - west) * 0.2;
  const latitudePadding = (north - south) * 0.2;
  return {
    west: west - longitudePadding,
    south: south - latitudePadding,
    east: east + longitudePadding,
    north: north + latitudePadding
  };
}

export function isPlaceInsideBounds(place: CuratedPlace, bounds: MapViewportBounds) {
  const [longitude, latitude] = place.coordinates;
  return longitude >= bounds.west && longitude <= bounds.east && latitude >= bounds.south && latitude <= bounds.north;
}

// Places arrive in guide-rank order, so the first non-overlapping ones in view get the photo pins.
export function pickPhotoPlaceIds(map: MapboxMap, places: CuratedPlace[], skipId: string | null) {
  const visible = map.getBounds();
  const ids = new Set<string>();
  if (!visible) return ids;
  const alwaysPhoto = map.getZoom() >= PHOTO_PIN_ALWAYS_ZOOM;
  const size = (map.getZoom() < COMPACT_PIN_ZOOM ? PHOTO_PIN_SIZE * 0.8 : PHOTO_PIN_SIZE) + PHOTO_PIN_GAP;
  const taken: { x: number; y: number }[] = [];
  for (const place of places) {
    if (!alwaysPhoto && ids.size >= MAX_PHOTO_PINS) break;
    if (place.id === skipId || !visible.contains(place.coordinates)) continue;
    const { x, y } = map.project(place.coordinates);
    // Pins grow upward from the point, so one right under the top edge would be cropped.
    if (!alwaysPhoto && y < size) continue;
    if (!alwaysPhoto && taken.some((point) => Math.abs(point.x - x) < size && Math.abs(point.y - y) < size)) continue;
    taken.push({ x, y });
    ids.add(place.id);
  }
  return ids;
}

export const applied3dObjects = new WeakMap<MapboxMap, boolean>();

export function setShow3dObjects(map: MapboxMap, show: boolean) {
  if (applied3dObjects.get(map) === show) return;
  try {
    map.setConfigProperty('basemap', 'show3dObjects', show);
    applied3dObjects.set(map, show);
  } catch {
    // Styles without the Standard basemap import don't expose this config.
  }
}

const compassBound = new WeakSet<MapboxMap>();

// Same cutoff as the zoom handler: above this the camera is already in the tilted 3D plane.
const PITCHED_PLANE = 20;

// North, and the place-focus tilt when the camera is already pitched. A flat map only loses its bearing.
export function bindCompassReset(map: MapboxMap) {
  if (compassBound.has(map)) return;
  compassBound.add(map);
  map.getContainer().addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.mapboxgl-ctrl-compass')) return;
      event.preventDefault();
      event.stopPropagation();
      map.stop();
      map.easeTo({
        bearing: 0,
        pitch: map.getPitch() > PITCHED_PLANE ? PLACE_3D_PITCH : 0,
        duration: 450
      });
    },
    true
  );
}

export function focusPlaceCamera(map: MapboxMap, place: CuratedPlace, buildings3d: boolean) {
  const padding = getMapPadding();
  if (!buildings3d) {
    map.easeTo({
      center: place.coordinates,
      zoom: Math.max(map.getZoom(), PLACE_ZOOM),
      pitch: 0,
      bearing: 0,
      padding,
      duration: 520
    });
    return;
  }
  const bearing = map.getPitch() > 20 ? map.getBearing() : PLACE_3D_BEARING;
  // On desktop a tilted building gets headroom for its silhouette; on mobile the
  // place sits in the middle of the map strip above the sheet.
  const headroom = window.innerWidth < MOBILE_QUERY_WIDTH ? 0 : Math.min(160, Math.round(window.innerHeight * 0.14));
  map.flyTo({
    center: place.coordinates,
    // Keep a closer zoom if the user already zoomed in further than the place default.
    zoom: Math.max(map.getZoom(), getPlace3dZoom()),
    pitch: PLACE_3D_PITCH,
    bearing,
    padding: { ...padding, top: padding.top + headroom },
    duration: 1400,
    curve: 1.2,
    essential: true
  });
}

// Mapbox's documented camera-orbit pattern updates only the native map camera per frame.
// React state changes only when the orbit starts or ends.
export function startPlaceCameraOrbit(map: MapboxMap, onComplete: () => void) {
  const startBearing = map.getBearing();
  let frameId = 0;
  let startTime: number | null = null;
  let cancelled = false;

  const frame = (time: number) => {
    if (cancelled) return;
    startTime ??= time;
    const progress = Math.min(1, (time - startTime) / PLACE_ORBIT_DURATION);
    // Start moving immediately, then ease gently into the final bearing.
    const easedProgress = 1 - Math.pow(1 - progress, 1.35);
    map.rotateTo(startBearing + 360 * easedProgress, { duration: 0 });
    if (progress < 1) {
      frameId = window.requestAnimationFrame(frame);
      return;
    }
    onComplete();
  };

  frameId = window.requestAnimationFrame(frame);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frameId);
  };
}

// Room the hover popup needs around a pin: it is centred on it, up to ~320px wide, and stands above it.
const REVEAL_EDGE = 170;
const REVEAL_POPUP_HEIGHT = 300;
const REVEAL_BOTTOM = 28;
// Zoomed in further than this, the overview is what lets a card's place be found on the map.
const REVEAL_ZOOMED_IN = CITY_ZOOM + 0.5;

/** True when the place sits inside the map strip with room for its pin and popup above it. */
export function isPlaceRevealed(map: MapboxMap, place: CuratedPlace) {
  const { x, y } = map.project(place.coordinates);
  const { left = 0, right = 0, top = 0, bottom = 0 } = map.getPadding();
  const container = map.getContainer();
  // On a short window the popup cannot get its full height; the middle of the strip always counts.
  const popupRoom = Math.min(REVEAL_POPUP_HEIGHT, (container.clientHeight - top - bottom) * 0.45);
  return (
    x >= left + REVEAL_EDGE &&
    x <= container.clientWidth - right - REVEAL_EDGE &&
    y >= top + popupRoom &&
    y <= container.clientHeight - bottom - REVEAL_BOTTOM
  );
}

export type CameraView = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export function readCameraView(map: MapboxMap): CameraView {
  const { lng, lat } = map.getCenter();
  return { center: [lng, lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
}

/** True once the camera is back on a saved view (an interrupted trip back leaves it somewhere else). */
export function isAtCameraView(map: MapboxMap, view: CameraView) {
  const now = map.project(map.getCenter());
  const target = map.project(view.center);
  return Math.abs(map.getZoom() - view.zoom) < 0.02 && Math.hypot(now.x - target.x, now.y - target.y) < 3;
}

/** Eases back to a view that was left for a card's place. The padding is read fresh: the window may have changed. */
export function restoreCameraView(map: MapboxMap, view: CameraView) {
  map.stop();
  map.easeTo({ ...view, padding: getMapPadding(), duration: 650 });
}

/**
 * Brings a hovered card's place into view, centred in the map strip so its popup has room above it.
 * After focusing one building the map is zoomed far in and shows almost nothing else, so it also steps back to
 * the city overview; closer in, it keeps the zoom and only pans.
 * Returns the view it left, or null when the place was already in view and the camera stayed put.
 */
export function revealPlaceCamera(map: MapboxMap, place: CuratedPlace): CameraView | null {
  if (isPlaceRevealed(map, place)) return null;
  const previous = readCameraView(map);
  const zoomedIn = map.getZoom() > REVEAL_ZOOMED_IN;
  map.stop();
  map.easeTo({
    center: place.coordinates,
    zoom: zoomedIn ? CITY_ZOOM : map.getZoom(),
    // A tilted close-up has no use for its tilt once it becomes an overview.
    pitch: zoomedIn ? 0 : map.getPitch(),
    bearing: zoomedIn ? 0 : map.getBearing(),
    padding: getMapPadding(),
    duration: zoomedIn ? 700 : 520
  });
  return previous;
}

export function focusCityCamera(map: MapboxMap, center: [number, number], duration = 650) {
  map.easeTo({
    center,
    zoom: CITY_ZOOM,
    pitch: 0,
    bearing: 0,
    padding: getMapPadding(),
    duration
  });
}
