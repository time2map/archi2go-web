import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Ref
} from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './design-two.css';

import { CityNotFoundError, defaultCityId, loadCity, loadCitySummaries } from './data/cityData';
import type { CitySummary, CuratedCity, CuratedPlace } from './places';
import {
  BUILDINGS_3D_MIN_ZOOM,
  BUILDINGS_3D_STORAGE_KEY,
  CITY_STORAGE_KEY,
  CITY_ZOOM,
  COMPACT_PIN_ZOOM,
  FILTERS,
  HOVER_PREVIEW_QUERY,
  MAPBOX_TOKEN,
  MAX_PHOTO_PINS,
  PLACE_3D_BEARING,
  PLACE_3D_PITCH,
  PLACE_ZOOM,
  readPreviewLoading,
  type CategoryFilter,
  type MapViewportBounds
} from './map-screen/config';
import { isKeyboardNavigation } from './map-screen/inputModality';
import { detectInitialCityId } from './map-screen/cityLocation';
import { MapCanvas } from './map-screen/MapCanvas';
import { resolvePlaceSearch } from './map-screen/placeSearch';
import {
  focusCityCamera,
  focusPlaceCamera,
  getMapPadding,
  isAtCameraView,
  isPlaceInsideBounds,
  pickPhotoPlaceIds,
  restoreCameraView,
  revealPlaceCamera,
  type CameraView,
  setPaddingKeepingView,
  setShow3dObjects
} from './map-screen/mapCamera';
import { AboutDialog, ContactDialog } from './map-screen/AppMenu';
import { PhotoLightbox } from './map-screen/PhotoLightbox';
import { PlacesSidebar } from './map-screen/PlacesSidebar';
import { cityPath, parseRoute, placePath, requestedCityId } from './map-screen/routes';
import { Icon, PreviewLoadingContext } from './map-screen/ui';
import { useMobileSheet } from './map-screen/useMobileSheet';

function describeLoadError(error: unknown) {
  if (error instanceof CityNotFoundError) return error.message;
  return navigator.onLine ? 'The guide server did not respond.' : 'You appear to be offline.';
}

export function MapScreen() {
  const [data, setData] = useState<{ cities: CitySummary[]; initialCity: CuratedCity } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const shouldDetectLocation = window.location.pathname === '/';
    // A root launch is location-driven; only explicit city routes are safe to preload.
    const requested = shouldDetectLocation ? null : requestedCityId();
    if (requested) loadCity(requested).catch(() => undefined);
    loadCitySummaries()
      .then(async (cities) => {
        const fallbackId = defaultCityId(cities);
        if (!fallbackId) throw new Error('No city guides found.');
        const cityIds = cities.map((city) => city.id);
        let { cityId } = parseRoute(cityIds, fallbackId);

        if (shouldDetectLocation) {
          // Warm the guaranteed fallback while the browser resolves the optional location permission.
          const fallbackRequest = loadCity(fallbackId);
          cityId = await detectInitialCityId(cities, fallbackId);
          const initialCity = cityId === fallbackId ? await fallbackRequest : await loadCity(cityId);
          if (!cancelled) setData({ cities, initialCity });
        return;
      }

        const initialCity = await loadCity(cityId);
        if (!cancelled) setData({ cities, initialCity });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(describeLoadError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
  return (
      <main className="design-variant-two">
        <div
          className="v2-state-card"
          role="alert">
          <strong>The guide could not be loaded</strong>
          <span>{error}</span>
      <button
        type="button"
            onClick={() => setAttempt((value) => value + 1)}>
            Retry
      </button>
    </div>
      </main>
    );
  }

  if (!data) {
  return (
      <main className="design-variant-two">
        <div
          className="v2-loading"
          role="status">
          <span /> Loading guide…
      </div>
      </main>
  );
}

  return (
    <MapScreenContent
      cities={data.cities}
      initialCity={data.initialCity}
    />
  );
}

function MapScreenContent({ cities, initialCity }: { cities: CitySummary[]; initialCity: CuratedCity }) {
  const cityIds = useMemo(() => cities.map((city) => city.id), [cities]);
  const fallbackCityId = defaultCityId(cities) ?? initialCity.id;
  const previewLoading = useMemo(readPreviewLoading, []);
  const loadingMode = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('loading');
    if (value === 'cities') return 'cities' as const;
    if (value === 'photos') return 'photos' as const;
    if (value === 'list') return 'list' as const;
    return previewLoading ? ('all' as const) : ('off' as const);
  }, [previewLoading]);
  const initialRoute = useMemo(() => {
    const route = parseRoute(cityIds, fallbackCityId);
    const placeExists = initialCity.places.some((place) => place.id === route.placeId);
    return { cityId: initialCity.id, placeId: placeExists ? route.placeId : null };
  }, []);
  const mapRef = useRef<MapboxMap | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [cityCache, setCityCache] = useState<Record<string, CuratedCity>>(() => ({ [initialCity.id]: initialCity }));
  const cityCacheRef = useRef(cityCache);
  cityCacheRef.current = cityCache;
  const [loadingCityId, setLoadingCityId] = useState<string | null>(null);
  const [cityLoadError, setCityLoadError] = useState<string | null>(null);
  const cityRequestRef = useRef(0);
  const [activeCityId, setActiveCityId] = useState(initialRoute.cityId);
  const activeCityIdRef = useRef(activeCityId);
  activeCityIdRef.current = activeCityId;
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialRoute.placeId);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('architecture');
  const [query, setQuery] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapViewportBounds, setMapViewportBounds] = useState<MapViewportBounds | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isCompactPins, setIsCompactPins] = useState(
    () => (initialRoute.placeId ? PLACE_ZOOM : CITY_ZOOM) < COMPACT_PIN_ZOOM
  );
  const [lightbox, setLightbox] = useState<{ place: CuratedPlace; index: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(
    () => new URLSearchParams(window.location.search).get('contact') === '1'
  );
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeContact = useCallback(() => {
    setContactOpen(false);
    const url = new URL(window.location.href);
    if (!url.searchParams.has('contact')) return;
    url.searchParams.delete('contact');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const [isCityPending, startCityTransition] = useTransition();
  const [previewPlaceId, setPreviewPlaceId] = useState<string | null>(null);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  // The card whose pin was pressed: its place has a popup on the map, which is brought into view.
  const [revealPlaceId, setRevealPlaceId] = useState<string | null>(null);
  // The view the map had before a card's pin sent it to that place; pressing the pin again restores it.
  const savedViewRef = useRef<CameraView | null>(null);
  const [hasSavedView, setHasSavedView] = useState(false);
  const [buildings3d, setBuildings3d] = useState(() => localStorage.getItem(BUILDINGS_3D_STORAGE_KEY) !== 'off');
  // Only the threshold matters for rendering; storing the raw zoom re-rendered every marker each frame.
  const [atBuildingsZoom, setAtBuildingsZoom] = useState(() => Boolean(initialRoute.placeId));
  const zoomModesRef = useRef({ buildings: atBuildingsZoom, compactPins: isCompactPins });
  const buildings3dRef = useRef(buildings3d);
  buildings3dRef.current = buildings3d;
  const isUserZoomingRef = useRef(false);
  const updateZoomModes = useCallback((zoom: number) => {
    const nextBuildings = zoom >= BUILDINGS_3D_MIN_ZOOM;
    const nextCompactPins = zoom < COMPACT_PIN_ZOOM;
    if (zoomModesRef.current.buildings !== nextBuildings) {
      zoomModesRef.current.buildings = nextBuildings;
      setAtBuildingsZoom(nextBuildings);
    }
    if (zoomModesRef.current.compactPins !== nextCompactPins) {
      zoomModesRef.current.compactPins = nextCompactPins;
      setIsCompactPins(nextCompactPins);
    }
  }, []);
  const selectedPlaceRef = useRef<CuratedPlace | null>(null);
  const lastSelectedIdRef = useRef<string | null>(initialRoute.placeId);
  const effectiveBuildings3d = buildings3d && atBuildingsZoom;
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const sheet = useMobileSheet();
  const {
    isMobileSheet,
    sheetLevel,
    sheetHeightsRef,
    isMobileSheetRef,
    sheetLevelRef,
    mainRef,
    asideRef,
    viewport,
    mainStyle,
    changeSheetLevel,
    focusSearchOnFullRef
  } = sheet;

  const previewOnHover = useCallback((placeId: string, hovered: boolean) => {
    if (hovered && !window.matchMedia(HOVER_PREVIEW_QUERY).matches) return;
    setPreviewPlaceId((current) => (hovered ? placeId : current === placeId ? null : current));
    setHighlightedPlaceId((current) => (hovered ? placeId : current === placeId ? null : current));
  }, []);

  const activeCity = cityCache[activeCityId] ?? initialCity;
  const places = activeCity.places;

  /**
   * The pin on a card: shows that place on the map. Its popup opens, and if the place is out of view (typically
   * because the map is zoomed in on the last opened place) the map steps back to the overview to find it.
   * The view it left is kept: the pin pressed again, or the Back button on the map, takes the map back there.
   */
  const keepSavedView = useCallback((view: CameraView | null) => {
    savedViewRef.current = view;
    setHasSavedView(view !== null);
  }, []);
  const forgetSavedView = useCallback(() => keepSavedView(null), [keepSavedView]);
  const returnToSavedView = useCallback(() => {
    setRevealPlaceId(null);
    const map = mapRef.current;
    const view = savedViewRef.current;
    if (!map || !view) return;
    restoreCameraView(map, view);
    // Kept until the camera is really there: another pin can cut the trip short, and the original view stays.
    map.once('moveend', () => {
      if (savedViewRef.current === view && isAtCameraView(map, view)) forgetSavedView();
    });
  }, [forgetSavedView]);
  const locatePlace = useCallback(
    (place: CuratedPlace) => {
      if (revealPlaceId === place.id) {
        returnToSavedView();
        return;
      }
      setRevealPlaceId(place.id);
      const map = mapRef.current;
      if (!map) return;
      const left = revealPlaceCamera(map, place);
      if (left && !savedViewRef.current) keepSavedView(left);
    },
    [keepSavedView, returnToSavedView, revealPlaceId]
  );
  // A card that goes away (new search, category, city or an opened place) takes its popup, and the way back, with it.
  useEffect(() => {
    forgetSavedView();
    setRevealPlaceId(null);
  }, [activeCityId, activeCategory, forgetSavedView, query, selectedPlaceId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    // Whoever moves the map by hand has chosen a view: it is never taken away to restore an old one.
    const onUserMove = (event: object) => {
      if ('originalEvent' in event && event.originalEvent) forgetSavedView();
    };
    const events = ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const;
    for (const name of events) map.on(name, onUserMove);
    return () => {
      for (const name of events) map.off(name, onUserMove);
    };
  }, [forgetSavedView, mapReady]);
  const availableFilters = useMemo(
    () => FILTERS.filter((filter) => filter.value === 'all' || places.some((place) => place.category === filter.value)),
    [places]
  );
  // The selected category is searched first; other categories, close names and recommendations top up a short result.
  const placeSearch = useMemo(
    () => resolvePlaceSearch(places, query, activeCategory),
    [activeCategory, places, query]
  );
  const visiblePlaces = placeSearch.places;
  // While searching, the list is already the set of pins to draw, so the category fade stays off.
  const categoryScope: CategoryFilter = query.trim() ? 'all' : activeCategory;
  const mapPlaces = useMemo(() => (query.trim() ? visiblePlaces : places), [places, query, visiblePlaces]);
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]
  );
  const renderedMapPlaces = useMemo(
    () =>
      mapViewportBounds
        ? mapPlaces.filter(
            (place) =>
              place.id === selectedPlaceId || place.id === revealPlaceId || isPlaceInsideBounds(place, mapViewportBounds)
          )
        : mapPlaces,
    [mapPlaces, mapViewportBounds, revealPlaceId, selectedPlaceId]
  );
  // Recomputed per settled viewport (mapViewportBounds changes on moveend), not per frame.
  // The place shown from a card stays a photo pin after the camera steps back to the overview,
  // where it would otherwise be one of the squares.
  const photoPlaceIds = useMemo(() => {
    const map = mapRef.current;
    const ids =
      !map || !mapViewportBounds
        ? new Set(visiblePlaces.slice(0, MAX_PHOTO_PINS).map((place) => place.id))
        : pickPhotoPlaceIds(map, visiblePlaces, selectedPlaceId);
    if (revealPlaceId && revealPlaceId !== selectedPlaceId) ids.add(revealPlaceId);
    return ids;
  }, [mapViewportBounds, revealPlaceId, selectedPlaceId, visiblePlaces]);
  selectedPlaceRef.current = selectedPlace;
  const popupPlaceId = previewPlaceId ?? revealPlaceId;
  const previewPlace =
    popupPlaceId && popupPlaceId !== selectedPlaceId
      ? (places.find((place) => place.id === popupPlaceId) ?? null)
      : null;

  const clearSelection = useCallback(
    (replaceHistory = false) => {
      setSelectedPlaceId(null);
      const method = replaceHistory ? 'replaceState' : 'pushState';
      if (window.location.pathname !== cityPath(activeCityId)) {
        window.history[method]({}, '', cityPath(activeCityId));
      }
    },
    [activeCityId]
  );

  const selectPlace = useCallback(
    (place: CuratedPlace, moveCamera = true) => {
      setSelectedPlaceId(place.id);
      setPreviewPlaceId(null);
      setHighlightedPlaceId(null);
      if (isMobileSheetRef.current) changeSheetLevel('half');
      lastSelectedIdRef.current = place.id;
      const nextPath = placePath(activeCityId, place.id);
      if (window.location.pathname !== nextPath) window.history.pushState({ placeId: place.id }, '', nextPath);
      if (moveCamera && mapRef.current) focusPlaceCamera(mapRef.current, place, buildings3dRef.current);
    },
    [activeCityId, changeSheetLevel, isMobileSheetRef]
  );

  const toggleBuildings3d = useCallback(() => {
    setBuildings3d((current) => {
      const next = !current;
      localStorage.setItem(BUILDINGS_3D_STORAGE_KEY, next ? 'on' : 'off');
      return next;
    });
  }, []);

  /** Shows a city once its places are available; only the latest request wins. */
  const showCity = useCallback(
    (cityId: string, placeId: string | null, cameraDuration: number) => {
      const request = ++cityRequestRef.current;
      const apply = (city: CuratedCity) => {
        if (request !== cityRequestRef.current) return;
        const place = placeId ? (city.places.find((candidate) => candidate.id === placeId) ?? null) : null;
        setLoadingCityId(null);
        setCityLoadError(null);
      startCityTransition(() => {
        setActiveCityId(city.id);
          setSelectedPlaceId(place?.id ?? null);
        setActiveCategory('architecture');
        setQuery('');
      });
        if (!mapRef.current) return;
        if (place) focusPlaceCamera(mapRef.current, place, buildings3dRef.current);
        else focusCityCamera(mapRef.current, city.center, cameraDuration);
      };

      const cached = cityCacheRef.current[cityId];
      if (cached) {
        apply(cached);
        return;
      }
      setLoadingCityId(cityId);
      loadCity(cityId)
        .then((city) => {
          setCityCache((current) => ({ ...current, [city.id]: city }));
          apply(city);
        })
        .catch((reason: unknown) => {
          if (request !== cityRequestRef.current) return;
          setLoadingCityId(null);
          setCityLoadError(describeLoadError(reason));
          window.history.replaceState({}, '', cityPath(activeCityIdRef.current));
      });
    },
    [startCityTransition]
  );

  const selectCity = useCallback(
    (cityId: string, replaceHistory = false) => {
      const nextCityId = cityIds.includes(cityId) ? cityId : fallbackCityId;
      localStorage.setItem(CITY_STORAGE_KEY, nextCityId);
      const method = replaceHistory ? 'replaceState' : 'pushState';
      if (window.location.pathname !== cityPath(nextCityId)) window.history[method]({}, '', cityPath(nextCityId));
      showCity(nextCityId, null, 650);
    },
    [cityIds, fallbackCityId, showCity]
  );

  useEffect(() => {
    const applyRoute = () => {
      const route = parseRoute(cityIds, fallbackCityId);
      setAtBuildingsZoom(Boolean(route.placeId && buildings3dRef.current));
      if (route.placeId) lastSelectedIdRef.current = route.placeId;
      showCity(route.cityId, route.placeId, 420);
    };

    if (window.location.pathname === '/') {
      selectCity(initialRoute.cityId, true);
    } else {
      const canonicalPath = initialRoute.placeId
        ? placePath(initialRoute.cityId, initialRoute.placeId)
        : cityPath(initialRoute.cityId);
      if (window.location.pathname !== canonicalPath) window.history.replaceState({}, '', canonicalPath);
    }
    window.addEventListener('popstate', applyRoute);
    return () => window.removeEventListener('popstate', applyRoute);
  }, [cityIds, fallbackCityId, initialRoute, selectCity, showCity]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    // Sheet level changes don't touch the camera: every camera move passes the current padding itself.
    if (map.isMoving()) return;
    setPaddingKeepingView(map, getMapPadding());
  }, [mapReady, viewport]);

  useEffect(() => {
    if (sheetLevel !== 'full' || !focusSearchOnFullRef.current) return;
    focusSearchOnFullRef.current = false;
    searchRef.current?.focus({ preventScroll: true });
  }, [focusSearchOnFullRef, sheetLevel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (!map.isMoving()) {
      setShow3dObjects(map, buildings3d);
      return;
    }
    const applyWhenSettled = () => setShow3dObjects(map, buildings3dRef.current);
    map.once('moveend', applyWhenSettled);
    return () => {
      map.off('moveend', applyWhenSettled);
    };
  }, [buildings3d, mapReady]);

  const skipFirst3dToggleEffect = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (skipFirst3dToggleEffect.current) {
      skipFirst3dToggleEffect.current = false;
      return;
    }
    if (!buildings3d) {
      map.stop();
      map.easeTo({ pitch: 0, bearing: 0, duration: 320 });
      return;
    }
    if (map.getZoom() < BUILDINGS_3D_MIN_ZOOM) return;
    if (selectedPlaceRef.current) {
      focusPlaceCamera(map, selectedPlaceRef.current, true);
      return;
    }
    map.stop();
    map.easeTo({
      pitch: PLACE_3D_PITCH,
      bearing: Math.abs(map.getBearing()) < 1 ? PLACE_3D_BEARING : map.getBearing(),
      duration: 520
    });
  }, [buildings3d, mapReady]);

  useEffect(() => {
    if (selectedPlaceId || !lastSelectedIdRef.current) return;
    const row = document.getElementById(`v2-place-${lastSelectedIdRef.current}`);
    const list = row?.closest<HTMLElement>('.v2-results');
    if (!row || !list) return;
    // scrollIntoView would also scroll the clipped page and shove the map off screen.
    const listRect = list.getBoundingClientRect();
    const sheetTop = asideRef.current?.getBoundingClientRect().top ?? listRect.top;
    // On mobile the lower part of the list sits below the screen; centre within the settled sheet.
    const visibleHeight = isMobileSheetRef.current
      ? sheetHeightsRef.current[sheetLevelRef.current]! - (listRect.top - sheetTop)
      : list.clientHeight;
    list.scrollTop += row.getBoundingClientRect().top - listRect.top - (visibleHeight - row.offsetHeight) / 2;
    if (isKeyboardNavigation() && (!document.activeElement || document.activeElement === document.body)) {
      row.querySelector<HTMLButtonElement>('.v2-place-hit')?.focus({ preventScroll: true });
    }
  }, [asideRef, isMobileSheetRef, selectedPlaceId, sheetHeightsRef, sheetLevelRef]);

  useEffect(() => {
    if (!selectedPlaceId || lightbox || aboutOpen || contactOpen) return;
    const backOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) clearSelection();
    };
    window.addEventListener('keydown', backOnEscape);
    return () => window.removeEventListener('keydown', backOnEscape);
  }, [aboutOpen, clearSelection, contactOpen, lightbox, selectedPlaceId]);

  const resetSelectionRoute = () => {
    setSelectedPlaceId(null);
    if (window.location.pathname !== cityPath(activeCity.id)) {
      window.history.replaceState({}, '', cityPath(activeCity.id));
    }
  };

  const changeCategory = (category: CategoryFilter) => {
    setActiveCategory(category);
    resetSelectionRoute();
  };

  const freezeList =
    previewLoading &&
    (loadingMode === 'list' || loadingMode === 'cities' || (loadingMode === 'all' && !selectedPlaceId));
  const cityPending = isCityPending || loadingCityId !== null || freezeList;
  const detailPlace = selectedPlace ?? (loadingMode === 'photos' ? (places[0] ?? null) : null);

  return (
    <PreviewLoadingContext.Provider value={previewLoading}>
      <main
        ref={mainRef as Ref<HTMLElement>}
        className="design-variant-two"
        data-sheet={isMobileSheet ? sheetLevel : undefined}
        style={mainStyle}>
        <MapCanvas
          activeCity={activeCity}
          selectedPlace={selectedPlace}
          selectedPlaceId={selectedPlaceId}
          renderedMapPlaces={renderedMapPlaces}
          activeCategory={categoryScope}
          photoPlaceIds={photoPlaceIds}
          previewPlace={previewPlace}
          previewPlaceId={previewPlaceId}
          highlightedPlaceId={highlightedPlaceId}
          buildings3d={buildings3d}
          buildings3dRef={buildings3dRef}
          effectiveBuildings3d={effectiveBuildings3d}
          isCompactPins={isCompactPins}
          isMobileSheet={isMobileSheet}
          sheetLevel={sheetLevel}
          mapRef={mapRef}
          isUserZoomingRef={isUserZoomingRef}
          updateZoomModes={updateZoomModes}
          onMapReady={() => setMapReady(true)}
          onMapError={setMapError}
          onViewportBounds={setMapViewportBounds}
          onSelectPlace={selectPlace}
          onPreviewHover={previewOnHover}
          onToggleBuildings3d={toggleBuildings3d}
          onMapClick={() => {
                setRevealPlaceId(null);
                if (!selectedPlaceId) return;
                setPreviewPlaceId(null);
                setHighlightedPlaceId(null);
                clearSelection();
              }}
          onDragStart={() => {
            setPreviewPlaceId(null);
            setRevealPlaceId(null);
          }}
          changeSheetLevel={changeSheetLevel}
        />

        <PlacesSidebar
          cities={cities}
          activeCity={activeCity}
          detailPlace={detailPlace}
          freezeList={freezeList}
          cityPending={cityPending}
          previewLoading={previewLoading}
          loadingMode={loadingMode}
          search={placeSearch}
          availableFilters={availableFilters}
          activeCategory={activeCategory}
          query={query}
          selectedPlaceId={selectedPlaceId}
          highlightedPlaceId={highlightedPlaceId}
          previewPlaceId={previewPlaceId}
          searchRef={searchRef}
          isMobileSheet={isMobileSheet}
          sheetLevel={sheetLevel}
          sheet={sheet}
          onSelectCity={selectCity}
          onSelectPlace={selectPlace}
          onClearSelection={clearSelection}
          onChangeCategory={changeCategory}
          onSetQuery={setQuery}
          onOpenPhoto={(index) => detailPlace && setLightbox({ place: detailPlace, index })}
          onOpenAbout={() => setAboutOpen(true)}
          onOpenContact={() => setContactOpen(true)}
          onSetHighlightedPlaceId={setHighlightedPlaceId}
          locatedPlaceId={revealPlaceId}
          onLocatePlace={locatePlace}
        />

        {hasSavedView && !selectedPlaceId ? (
          <button
            className="v2-map-back"
            type="button"
            aria-label="Back to the previous map view"
            onClick={returnToSavedView}>
            <Icon name="arrow-left" />
            <span>Back</span>
          </button>
        ) : null}

        {!MAPBOX_TOKEN && (
          <div
            className="v2-state-card"
            role="status">
            <strong>Map preview is unavailable</strong>
            <span>
              Add <code>VITE_MAPBOX_ACCESS_TOKEN</code> to <code>.env</code>. The guide remains available.
            </span>
          </div>
        )}
        {MAPBOX_TOKEN && !mapError && (!mapReady || previewLoading) && (
          <div
            className="v2-loading"
            role="status">
            <span /> Loading map…
          </div>
        )}
        {mapError && MAPBOX_TOKEN && (
          <div
            className="v2-state-card"
            role="alert">
            <strong>The map could not be loaded</strong>
            <span>{mapError}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}
        {!isOnline && (
          <div
            className="v2-offline"
            role="status">
            Offline — showing cached guide content
          </div>
        )}
        {isOnline && cityLoadError && (
          <div
            className="v2-offline"
            role="alert">
            {cityLoadError} Try choosing the city again.
          </div>
        )}
        {lightbox?.place.photo ? (
          <PhotoLightbox
            place={lightbox.place}
            city={activeCity}
            initialIndex={lightbox.index}
            onClose={closeLightbox}
          />
        ) : null}
        {aboutOpen ? (
          <AboutDialog
            onClose={closeAbout}
            onContact={() => {
              setAboutOpen(false);
              setContactOpen(true);
            }}
          />
        ) : null}
        {contactOpen ? <ContactDialog onClose={closeContact} /> : null}
      </main>
    </PreviewLoadingContext.Provider>
  );
}
