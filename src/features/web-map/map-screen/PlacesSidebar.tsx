import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref
} from 'react';
import { Archi2goLogo } from '../Archi2goLogo';
import { Time2mapMark } from '../Time2mapMark';
import type { CitySummary, CuratedCity, CuratedPlace } from '../places';
import { AppMenu } from './AppMenu';
import { CitySelect } from './CitySelect';
import {
  FILTERS,
  type CategoryFilter,
  type SheetLevel
} from './config';
import type { PlaceSearchResult, SearchSection } from './placeSearch';
import { PlaceCard } from './PlaceCard';
import { PlaceDetail } from './PlaceDetail';
import { PlaceListSkeleton } from './ui';
import type { MobileSheetApi } from './useMobileSheet';

export function PlacesSidebar({
  cities,
  activeCity,
  detailPlace,
  freezeList,
  cityPending,
  previewLoading,
  loadingMode,
  search,
  availableFilters,
  activeCategory,
  query,
  highlightedPlaceId,
  previewPlaceId,
  isMobileSheet,
  sheetLevel,
  sheet,
  onSelectCity,
  onSelectPlace,
  previousPlace,
  nextPlace,
  placePosition,
  placeCount,
  onNavigatePlace,
  onClearSelection,
  onChangeCategory,
  onOpenPhoto,
  onOpenAbout,
  onOpenContact,
  onSetHighlightedPlaceId
}: {
  cities: CitySummary[];
  activeCity: CuratedCity;
  detailPlace: CuratedPlace | null;
  freezeList: boolean;
  cityPending: boolean;
  previewLoading: boolean;
  loadingMode: 'cities' | 'photos' | 'list' | 'all' | 'off';
  search: PlaceSearchResult;
  availableFilters: typeof FILTERS;
  activeCategory: CategoryFilter;
  query: string;
  highlightedPlaceId: string | null;
  previewPlaceId: string | null;
  isMobileSheet: boolean;
  sheetLevel: SheetLevel;
  sheet: MobileSheetApi;
  onSelectCity: (cityId: string) => void;
  onSelectPlace: (place: CuratedPlace) => void;
  previousPlace: CuratedPlace | null;
  nextPlace: CuratedPlace | null;
  placePosition: number | null;
  placeCount: number;
  onNavigatePlace: (place: CuratedPlace) => void;
  onClearSelection: (replaceHistory?: boolean) => void;
  onChangeCategory: (category: CategoryFilter) => void;
  onOpenPhoto: (index: number) => void;
  onOpenAbout: () => void;
  onOpenContact: () => void;
  onSetHighlightedPlaceId: (updater: string | null | ((current: string | null) => string | null)) => void;
}) {
  const filterBarRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const savedListScrollTopRef = useRef(0);
  // Typing temporarily reveals the result cards without clearing the selected marker or route.
  const shownDetailPlace = !freezeList && !query.trim() ? detailPlace : null;
  // Where the selected tab's underline sits, as a slice of the full-row rule.
  const [rule, setRule] = useState<{ x: number; scale: number } | null>(null);

  const measureRule = useCallback(() => {
    const bar = filterBarRef.current;
    const active = bar?.querySelector<HTMLElement>('.v2-filters button.is-active');
    if (!bar || !active) {
      setRule((current) => (current ? null : current));
      return;
    }
    const barBox = bar.getBoundingClientRect();
    // Measured from layout so the underline remains stable while the filter row scrolls.
    const filters = active.parentElement as HTMLElement;
    const tabLeft = filters.getBoundingClientRect().left + active.offsetLeft - filters.scrollLeft;
    const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    const width = barBox.width - pad * 2;
    if (width <= 0) return;
    const next = {
      x: tabLeft - barBox.left - pad,
      scale: active.offsetWidth / width
    };
    setRule((current) =>
      current &&
      Math.abs(current.x - next.x) < 0.5 &&
      Math.abs(current.scale - next.scale) < 0.001
        ? current
        : next
    );
  }, []);

  // Re-measured when the selected tab, the tab set or the row's size changes (fonts, resize, sheet).
  useLayoutEffect(() => {
    measureRule();
  }, [measureRule, activeCategory, availableFilters, cityPending, shownDetailPlace]);

  useEffect(() => {
    const bar = filterBarRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(measureRule);
    observer.observe(bar);
    const filters = bar.querySelector('.v2-filters');
    filters?.addEventListener('scroll', measureRule, { passive: true });
    void document.fonts?.ready.then(measureRule);
    return () => {
      observer.disconnect();
      filters?.removeEventListener('scroll', measureRule);
    };
  }, [measureRule, cityPending, shownDetailPlace]);

  // A category or query produces a new card order. Start it at the top before paint.
  useLayoutEffect(() => {
    const list = resultsRef.current;
    savedListScrollTopRef.current = 0;
    if (list) list.scrollTop = 0;
  }, [activeCategory, query]);

  // Opening a detail unmounts the list. Restore the exact previous scroll position when it returns.
  useLayoutEffect(() => {
    if (shownDetailPlace || freezeList) return;
    const list = resultsRef.current;
    if (list) list.scrollTop = savedListScrollTopRef.current;
  }, [shownDetailPlace, freezeList]);

  // A search that falls short says so once, then the list carries on with what is worth seeing instead.
  const shownQuery = query.trim().length > 40 ? `${query.trim().slice(0, 40)}…` : query.trim();
  const categoryLabel = availableFilters.find((filter) => filter.value === activeCategory)?.label ?? 'this category';
  const note = !query.trim()
    ? null
    : search.status === 'other-categories'
      ? { title: `Nothing in ${categoryLabel}`, text: 'These match in other categories.' }
      : search.status === 'similar'
        ? { title: `No exact match for “${shownQuery}”`, text: 'Closest names in this city.' }
        : search.status === 'none'
          ? { title: `Nothing found for “${shownQuery}”`, text: `Here is what we recommend in ${activeCity.name}.` }
          : null;
  // The first section needs no label: the note or the search field already says what it is.
  const sectionHeading = (section: SearchSection, index: number) =>
    index > 0 && section.kind === 'recommended'
      ? `Recommended in ${activeCity.name}`
      : index > 0 && section.kind === 'other-categories'
        ? 'In other categories'
        : null;

  return (
    <aside
      ref={sheet.asideRef as Ref<HTMLElement>}
      className={`v2-sidebar${shownDetailPlace ? ' is-detail' : ''}`}
      aria-label={shownDetailPlace ? shownDetailPlace.title : `${activeCity.name} places`}
      onPointerDown={isMobileSheet ? sheet.onSheetMouseDown : undefined}
      onClickCapture={sheet.onAsideClickCapture}>
      {isMobileSheet ? (
        <button
          type="button"
          className="v2-sheet-handle"
          onClick={sheet.cycleSheet}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            sheet.stepSheet(event.key === 'ArrowUp' ? 1 : -1);
          }}
          aria-label={sheet.sheetHandleLabel}
          aria-expanded={sheetLevel !== 'peek'}>
          <span />
        </button>
      ) : null}
      {shownDetailPlace ? (
        <PlaceDetail
          key={shownDetailPlace.id}
          place={shownDetailPlace}
          city={activeCity}
          previousPlace={previousPlace}
          nextPlace={nextPlace}
          placePosition={placePosition}
          placeCount={placeCount}
          onNavigatePlace={onNavigatePlace}
          onBack={() => {
            if (isMobileSheet) sheet.changeSheetLevel('half');
            onClearSelection(true);
          }}
          onOpenPhoto={onOpenPhoto}
          onOpenMenu={() => {
            if (isMobileSheet && sheetLevel === 'peek') sheet.changeSheetLevel('half');
          }}
          onOpenAbout={onOpenAbout}
          onOpenContact={onOpenContact}
        />
      ) : (
        <>
          <header className="v2-sidebar-header">
            <div className="v2-brand">
              <Archi2goLogo />
              <span className="v2-edition">City guide</span>
            </div>

            <CitySelect
              cities={cities}
              city={activeCity}
              pending={cityPending}
              onSelect={onSelectCity}
              onOpen={() => {
                if (isMobileSheet && sheetLevel === 'peek') sheet.changeSheetLevel('half');
              }}
              forceOpen={loadingMode === 'cities'}
              forceLoading={previewLoading}
            />

            <AppMenu
              onOpen={() => {
                if (isMobileSheet && sheetLevel === 'peek') sheet.changeSheetLevel('half');
              }}
              onAbout={onOpenAbout}
              onContact={onOpenContact}
            />

            <h1 className="v2-visually-hidden">{activeCity.name} places</h1>

            {/* Search lives on the map; this row remains the category control for the result list. */}
            <div
              ref={filterBarRef}
              className="v2-filter-bar"
              style={
                rule
                  ? ({ '--rule-x': `${rule.x}px`, '--rule-scale': rule.scale } as CSSProperties)
                  : undefined
              }>
              <div className="v2-filter-stage">
                <div className="v2-filters" role="group" aria-label="Filter places by category">
                  {availableFilters.map((filter) => (
                    <button
                      key={filter.value}
                      className={activeCategory === filter.value ? 'is-active' : ''}
                      type="button"
                      onClick={() => {
                        onChangeCategory(filter.value);
                        // Same category again still means "back to the top of this list".
                        if (resultsRef.current) resultsRef.current.scrollTop = 0;
                      }}
                      aria-pressed={activeCategory === filter.value}>
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <span
                className={`v2-filter-rule${rule ? '' : ' is-unmarked'}`}
                aria-hidden="true"
              />
            </div>
          </header>

          <div
            ref={resultsRef}
            className="v2-results"
            role="region"
            aria-label="Places list"
            aria-live="polite"
            aria-busy={cityPending}
            onScroll={(event) => {
              savedListScrollTopRef.current = event.currentTarget.scrollTop;
            }}>
            {cityPending ? (
              <PlaceListSkeleton />
            ) : search.places.length === 0 ? (
              <div className="v2-empty">
                <strong>No places yet</strong>
                <span>This guide has no places to show.</span>
              </div>
            ) : (
              <>
                {note ? (
                  <div className="v2-empty is-note">
                    <strong>{note.title}</strong>
                    <span>{note.text}</span>
                  </div>
                ) : null}
                {search.sections.map((section, index) => (
                  <Fragment key={section.kind}>
                    {sectionHeading(section, index) ? (
                      <h2 className="v2-results-heading">{sectionHeading(section, index)}</h2>
                    ) : null}
                    <div className="v2-place-grid">
                      {section.places.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          highlighted={highlightedPlaceId === place.id || previewPlaceId === place.id}
                          onSelect={(selectedPlace) => {
                            savedListScrollTopRef.current = resultsRef.current?.scrollTop ?? 0;
                            onSelectPlace(selectedPlace);
                          }}
                          onMouseEnter={() => onSetHighlightedPlaceId(place.id)}
                          onMouseLeave={() =>
                            onSetHighlightedPlaceId((current) =>
                              current === place.id && previewPlaceId !== place.id ? null : current
                            )
                          }
                        />
                      ))}
                    </div>
                  </Fragment>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <footer className="v2-sidebar-footer">
        <a href="/privacy">Privacy policy</a>
        <a
          className="v2-time2map"
          href="https://time2map.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="time2map — Maps and GIS solutions">
          <span aria-hidden="true">by</span>
          <Time2mapMark className="v2-time2map-mark" />
          <span>time2map</span>
        </a>
      </footer>
    </aside>
  );
}
