import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import Map, { AttributionControl, NavigationControl, Popup } from 'react-map-gl/mapbox';
import type { CuratedCity, CuratedPlace } from '../places';
import {
  CITY_ZOOM,
  COMPACT_MARKER_MODE,
  DOT_PIN_STYLE,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  PLACE_3D_BEARING,
  MAP_MAX_PITCH,
  PLACE_3D_PITCH,
  PLACE_ZOOM,
  BUILDINGS_3D_MIN_ZOOM,
  POI_LABELS_MIN_ZOOM,
  type CategoryFilter,
  type MapViewportBounds,
  type SheetLevel
} from './config';
import {
  applied3dObjects,
  bindCompassReset,
  getBufferedMapBounds,
  getMapPadding,
  getPlace3dZoom,
  startPlaceCameraOrbit
} from './mapCamera';
import { ensureCustomRoadLabels, SURVEY_MAP_DESIGN } from './mapDesigns';
import { Buildings3DControl, HoverPreview, MapPlaceMarker, OrbitControl } from './MapMarkers';

const currentBasemap = SURVEY_MAP_DESIGN.basemap;

type MarkerCollisionBox = { left: number; right: number; top: number; bottom: number };

function markerBoxesOverlap(a: MarkerCollisionBox, b: MarkerCollisionBox) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function syncPoiVisibility(map: MapboxMap) {
  try {
    const visible = map.getZoom() >= POI_LABELS_MIN_ZOOM;
    if (map.getConfigProperty('basemap', 'showPointOfInterestLabels') !== visible) {
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', visible);
    }
  } catch {
    // Classic styles have no POI-label config.
  }
}

export function MapCanvas({
  activeCity,
  selectedPlace,
  selectedPlaceId,
  renderedMapPlaces,
  activeCategory,
  photoPlaceIds,
  previewPlace,
  previewPlaceId,
  highlightedPlaceId,
  buildings3d,
  buildings3dRef,
  effectiveBuildings3d,
  isCompactPins,
  isMobileSheet,
  sheetLevel,
  mapRef,
  isUserZoomingRef,
  updateZoomModes,
  onMapReady,
  onMapError,
  onViewportBounds,
  onSelectPlace,
  onPreviewHover,
  onToggleBuildings3d,
  onMapClick,
  onDragStart,
  changeSheetLevel
}: {
  activeCity: CuratedCity;
  selectedPlace: CuratedPlace | null;
  selectedPlaceId: string | null;
  renderedMapPlaces: CuratedPlace[];
  activeCategory: CategoryFilter;
  photoPlaceIds: ReadonlySet<string>;
  previewPlace: CuratedPlace | null;
  previewPlaceId: string | null;
  highlightedPlaceId: string | null;
  buildings3d: boolean;
  buildings3dRef: MutableRefObject<boolean>;
  effectiveBuildings3d: boolean;
  isCompactPins: boolean;
  isMobileSheet: boolean;
  sheetLevel: SheetLevel;
  mapRef: MutableRefObject<MapboxMap | null>;
  isUserZoomingRef: MutableRefObject<boolean>;
  updateZoomModes: (zoom: number) => void;
  onMapReady: () => void;
  onMapError: (message: string | null) => void;
  onViewportBounds: (bounds: MapViewportBounds | null) => void;
  onSelectPlace: (place: CuratedPlace) => void;
  onPreviewHover: (placeId: string, hovered: boolean) => void;
  onToggleBuildings3d: () => void;
  onMapClick: () => void;
  onDragStart: () => void;
  changeSheetLevel: (level: SheetLevel) => void;
}) {
  const loggedZoomRef = useRef<string | null>(null);
  const orbitCancelRef = useRef<(() => void) | null>(null);
  const orbitingRef = useRef(false);
  // Last settled zoom — used to detect crossing into the 3D buildings band.
  const lastZoomRef = useRef<number | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isOrbiting, setIsOrbiting] = useState(false);

  const stopOrbit = useCallback(() => {
    orbitCancelRef.current?.();
    orbitCancelRef.current = null;
    if (!orbitingRef.current) return;
    orbitingRef.current = false;
    setIsOrbiting(false);
    const map = mapRef.current;
    if (map) onViewportBounds(getBufferedMapBounds(map));
  }, [mapRef, onViewportBounds]);

  const startOrbit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId || !buildings3d) return;
    orbitCancelRef.current?.();
    orbitingRef.current = true;
    setIsOrbiting(true);
    map.stop();
    orbitCancelRef.current = startPlaceCameraOrbit(map, () => {
      orbitCancelRef.current = null;
      orbitingRef.current = false;
      setIsOrbiting(false);
      onViewportBounds(getBufferedMapBounds(map));
    });
  }, [buildings3d, mapRef, onViewportBounds, selectedPlaceId]);

  useEffect(() => {
    stopOrbit();
    const map = mapRef.current;
    if (!mapLoaded || !map || !selectedPlaceId || !buildings3d) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const startWhenSettled = () => {
      if (!orbitingRef.current) startOrbit();
    };
    if (map.isMoving()) map.once('moveend', startWhenSettled);
    else startWhenSettled();
    return () => {
      map.off('moveend', startWhenSettled);
      stopOrbit();
    };
  }, [buildings3d, mapLoaded, mapRef, selectedPlaceId, startOrbit, stopOrbit]);
  // A list hover lifts a dot into a photo pin; a map hover keeps the dot so the target doesn't move under the cursor.
  const isDotPlace = (placeId: string) =>
    placeId !== selectedPlaceId &&
    !photoPlaceIds.has(placeId) &&
    !(highlightedPlaceId === placeId && previewPlaceId !== placeId);
  const collisionSafeFilteredIds = useMemo(() => {
    const map = mapRef.current;
    if (!map || activeCategory === 'all') return null;

    const occupied: MarkerCollisionBox[] = [];
    const filteredPlaces: CuratedPlace[] = [];

    for (const place of renderedMapPlaces) {
      const selected = place.id === selectedPlaceId;
      if (!selected && place.category !== activeCategory) {
        filteredPlaces.push(place);
        continue;
      }

      const { x, y } = map.project(place.coordinates);
      const promotedToPhoto =
        !selected && (photoPlaceIds.has(place.id) || (highlightedPlaceId === place.id && previewPlaceId !== place.id));
      if (selected) {
        occupied.push({ left: x - 21, right: x + 21, top: y - 21, bottom: y + 21 });
      } else if (promotedToPhoto) {
        occupied.push({ left: x - 40, right: x + 40, top: y - 90, bottom: y + 12 });
      } else {
        occupied.push({ left: x - 9, right: x + 9, top: y - 9, bottom: y + 9 });
      }
    }

    const visibleIds = new Set<string>();
    for (const place of filteredPlaces) {
      const { x, y } = map.project(place.coordinates);
      // The 12px dot gets a small breathing zone so translucent pixels never stack.
      const box = { left: x - 8, right: x + 8, top: y - 8, bottom: y + 8 };
      if (occupied.some((candidate) => markerBoxesOverlap(candidate, box))) continue;
      occupied.push(box);
      visibleIds.add(place.id);
    }
    return visibleIds;
  }, [activeCategory, highlightedPlaceId, mapRef, photoPlaceIds, previewPlaceId, renderedMapPlaces, selectedPlaceId]);
  return (
    <div
      className={`v2-map-canvas${isCompactPins ? ' is-compact-pins' : ''}${COMPACT_MARKER_MODE === 'category' ? ' marker-mode-category' : ' marker-mode-neutral'} dot-pin-${DOT_PIN_STYLE}${activeCategory !== 'all' ? ' category-filter-active' : ''}${selectedPlaceId ? ' has-selection' : ''}`}
      role="region"
      aria-label={`Map of curated places in ${activeCity.name}`}>
      {MAPBOX_TOKEN ? (
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAPBOX_STYLE}
          initialViewState={{
            longitude: selectedPlace?.coordinates[0] ?? activeCity.center[0],
            latitude: selectedPlace?.coordinates[1] ?? activeCity.center[1],
            zoom: selectedPlace && buildings3d ? getPlace3dZoom() : selectedPlace ? PLACE_ZOOM : CITY_ZOOM,
            pitch: selectedPlace && buildings3d ? PLACE_3D_PITCH : 0,
            bearing: selectedPlace && buildings3d ? PLACE_3D_BEARING : 0,
            padding: getMapPadding()
          }}
          minZoom={9}
          maxZoom={19}
          maxPitch={MAP_MAX_PITCH}
          dragRotate
          touchPitch={isMobileSheet}
          fadeDuration={isMobileSheet ? 0 : 150}
          attributionControl={false}
          logoPosition="bottom-right"
          antialias={false}
          failIfMajorPerformanceCaveat={false}
          // Mapbox GL JS sends performance metrics to Mapbox unless told not to.
          performanceMetricsCollection={false}
          reuseMaps
          config={{
            basemap: {
              ...currentBasemap,
              show3dObjects: buildings3d
            }
          }}
          onLoad={(event) => {
            mapRef.current = event.target;
            setMapLoaded(true);
            bindCompassReset(event.target);
            event.target.setPadding(getMapPadding());
            const zoom = event.target.getZoom();
            lastZoomRef.current = zoom;
            updateZoomModes(zoom);
            applied3dObjects.set(event.target, buildings3dRef.current);
            syncPoiVisibility(event.target);
            ensureCustomRoadLabels(event.target);
            onViewportBounds(getBufferedMapBounds(event.target));
            onMapReady();
            onMapError(null);
          }}
          onMoveEnd={(event) => {
            if (orbitingRef.current) return;
            onViewportBounds(getBufferedMapBounds(event.target));
          }}
          onClick={() => {
            stopOrbit();
            if (isMobileSheet) changeSheetLevel('peek');
            onMapClick();
          }}
          onZoomStart={(event) => {
            // Pinch and wheel set originalEvent. The +/- control does not — threshold
            // crossing in onZoomEnd still picks that up via lastZoomRef.
            if ('originalEvent' in event && event.originalEvent) {
              stopOrbit();
              isUserZoomingRef.current = true;
            }
          }}
          onRotateStart={(event) => {
            if ('originalEvent' in event && event.originalEvent) stopOrbit();
          }}
          onPitchStart={(event) => {
            if ('originalEvent' in event && event.originalEvent) stopOrbit();
          }}
          // onZoom={(event) => {
          //   updateZoomModes(event.viewState.zoom);
          //   const zoom = event.viewState.zoom.toFixed(2);
          //   if (loggedZoomRef.current === zoom) return;
          //   loggedZoomRef.current = zoom;
          //   console.log('zoom', zoom);
          // }}
          onZoomEnd={(event) => {
            syncPoiVisibility(event.target);
            const zoom = event.viewState.zoom;
            const previousZoom = lastZoomRef.current;
            lastZoomRef.current = zoom;
            updateZoomModes(zoom);
            const crossedInto3d =
              previousZoom !== null && previousZoom < BUILDINGS_3D_MIN_ZOOM && zoom >= BUILDINGS_3D_MIN_ZOOM;
            const crossedOutOf3d =
              previousZoom !== null && previousZoom >= BUILDINGS_3D_MIN_ZOOM && zoom < BUILDINGS_3D_MIN_ZOOM;
            const wasUserZoom = isUserZoomingRef.current;
            isUserZoomingRef.current = false;
            // Crossing the 3D band via +/- has no originalEvent on zoomstart; still treat it as user intent.
            if (!wasUserZoom && !crossedInto3d && !crossedOutOf3d) return;
            const map = mapRef.current;
            if (!map) return;
            if (buildings3dRef.current && zoom >= BUILDINGS_3D_MIN_ZOOM) {
              // On the phone a pinch often leaves a shallow accidental tilt (touchPitch).
              // Only skip when the camera is already at the designed 3D angle.
              if (map.getPitch() >= PLACE_3D_PITCH - 5) return;
              map.stop();
              map.easeTo({
                pitch: PLACE_3D_PITCH,
                bearing: Math.abs(map.getBearing()) < 1 ? PLACE_3D_BEARING : map.getBearing(),
                duration: 520
              });
              return;
            }
            // Leaving the 3D band returns the map to 2D, on the phone too. Below it, a tilt set by hand
            // on the phone stays; the desktop overview always drops back to top-down.
            if ((crossedOutOf3d || !isMobileSheet) && map.getPitch() > 0.5) {
              map.stop();
              map.easeTo(crossedOutOf3d ? { pitch: 0, bearing: 0, duration: 420 } : { pitch: 0, duration: 180 });
            }
          }}
          onDragStart={() => {
            stopOrbit();
            onDragStart();
            if (isMobileSheet && sheetLevel === 'half' && !selectedPlaceId) changeSheetLevel('peek');
          }}
          onError={(event) => {
            // loaded() is false whenever tiles are in flight, so only errors before the first load are fatal.
            if (!mapRef.current) onMapError(event.error?.message ?? 'The map could not be loaded.');
            else console.warn('Mapbox error', event.error);
          }}>
          <NavigationControl
            position="top-right"
            showCompass
            visualizePitch
          />
          <Buildings3DControl
            enabled={buildings3d}
            active={effectiveBuildings3d}
            onToggle={onToggleBuildings3d}
          />
          {selectedPlaceId && buildings3d ? (
            <OrbitControl
              active={isOrbiting}
              onToggle={isOrbiting ? stopOrbit : startOrbit}
            />
          ) : null}
          <AttributionControl position="bottom-right" />
          {renderedMapPlaces.map((place) => {
            const selected = selectedPlaceId === place.id;
            // During the 360 orbit only the selected square stays on the map.
            if (isOrbiting && !selected) return null;
            const highlighted = highlightedPlaceId === place.id || previewPlaceId === place.id;
            const filtered = activeCategory !== 'all' && place.category !== activeCategory && !selected;
            if (filtered && collisionSafeFilteredIds && !collisionSafeFilteredIds.has(place.id)) return null;
            return (
              <MapPlaceMarker
                key={place.id}
                place={place}
                selected={selected}
                highlighted={highlighted}
                filtered={filtered}
                dot={isDotPlace(place.id)}
                onSelect={onSelectPlace}
                onHoverChange={onPreviewHover}
              />
            );
          })}
          {previewPlace && !isOrbiting ? (
            <Popup
              key={previewPlace.id}
              className="v2-map-popup v2-hover-popup"
              anchor="bottom"
              longitude={previewPlace.coordinates[0]}
              latitude={previewPlace.coordinates[1]}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
              maxWidth="320px"
              offset={isDotPlace(previewPlace.id) ? 26 : isCompactPins ? 72 : 90}>
              <HoverPreview place={previewPlace} />
            </Popup>
          ) : null}
        </Map>
      ) : null}
    </div>
  );
}
