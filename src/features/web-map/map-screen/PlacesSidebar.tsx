import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject
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
import { Icon, PlaceListSkeleton } from './ui';
import type { MobileSheetApi } from './useMobileSheet';

// Gap between the right end of the field and its category label (field padding 4px + label padding 4px).
// The selected tab travels there when search opens, so it lands exactly where the label appears.
const SEARCH_LABEL_INSET = 8;

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
  selectedPlaceId,
  highlightedPlaceId,
  previewPlaceId,
  searchRef,
  isMobileSheet,
  sheetLevel,
  sheet,
  onSelectCity,
  onSelectPlace,
  onClearSelection,
  onChangeCategory,
  onSetQuery,
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
  selectedPlaceId: string | null;
  highlightedPlaceId: string | null;
  previewPlaceId: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  isMobileSheet: boolean;
  sheetLevel: SheetLevel;
  sheet: MobileSheetApi;
  onSelectCity: (cityId: string) => void;
  onSelectPlace: (place: CuratedPlace) => void;
  onClearSelection: (replaceHistory?: boolean) => void;
  onChangeCategory: (category: CategoryFilter) => void;
  onSetQuery: (query: string) => void;
  onOpenPhoto: (index: number) => void;
  onOpenAbout: () => void;
  onOpenContact: () => void;
  onSetHighlightedPlaceId: (updater: string | null | ((current: string | null) => string | null)) => void;
}) {
  // The sidebar can remount (desktop/mobile switch) while a query is live; the field must stay open for it.
  const [searchOpen, setSearchOpen] = useState(() => query.trim() !== '');
  const searchToggleRef = useRef<HTMLButtonElement | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  // Where the selected tab's underline sits, as a slice of the full-row rule it grows from.
  // `shift` is how far the selected tab travels right to rest where the field's category label sits.
  const [rule, setRule] = useState<{ x: number; scale: number; shift: number } | null>(null);

  const measureRule = useCallback(() => {
    const bar = filterBarRef.current;
    const active = bar?.querySelector<HTMLElement>('.v2-filters button.is-active');
    if (!bar || !active) {
      setRule((current) => (current ? null : current));
      return;
    }
    const barBox = bar.getBoundingClientRect();
    // Measured from layout (offsetLeft), not from the tab's box: while searching the tab is mid-travel,
    // and a transformed box would feed its own offset back into the next measurement.
    const filters = active.parentElement as HTMLElement;
    const stage = filters.parentElement as HTMLElement;
    const tabLeft = filters.getBoundingClientRect().left + active.offsetLeft - filters.scrollLeft;
    const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    const width = barBox.width - pad * 2;
    if (width <= 0) return;
    const next = {
      x: tabLeft - barBox.left - pad,
      scale: active.offsetWidth / width,
      shift: Math.max(0, stage.getBoundingClientRect().right - SEARCH_LABEL_INSET - (tabLeft + active.offsetWidth))
    };
    setRule((current) =>
      current &&
      Math.abs(current.x - next.x) < 0.5 &&
      Math.abs(current.scale - next.scale) < 0.001 &&
      Math.abs(current.shift - next.shift) < 0.5
        ? current
        : next
    );
  }, []);

  // Re-measured when the selected tab, the tab set or the row's size changes (fonts, resize, sheet).
  useLayoutEffect(() => {
    measureRule();
  }, [measureRule, activeCategory, availableFilters, cityPending, detailPlace]);

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
  }, [measureRule, cityPending, detailPlace]);

  const closeSearch = useCallback(
    (returnFocus = false) => {
      setSearchOpen(false);
      onSetQuery('');
      if (returnFocus) searchToggleRef.current?.focus({ preventScroll: true });
    },
    [onSetQuery]
  );

  // The field is inert while closed, so focus can only move once the open state has committed.
  useEffect(() => {
    if (!searchOpen) return;
    if (isMobileSheet) sheet.openMobileSearch(searchRef);
    else searchRef.current?.focus({ preventScroll: true });
    // Only the open transition should move focus or the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // A new city resets the query upstream; the field closes with it.
  useEffect(() => {
    setSearchOpen(false);
  }, [activeCity.id]);

  // A new category is a new list. Reset before paint so the previous scroll position never shows.
  useLayoutEffect(() => {
    const list = resultsRef.current;
    if (list) list.scrollTop = 0;
  }, [activeCategory]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setSearchOpen(true);
      requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [searchRef]);

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
      className={`v2-sidebar${!freezeList && detailPlace ? ' is-detail' : ''}`}
      aria-label={!freezeList && detailPlace ? detailPlace.title : `${activeCity.name} places`}
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
      {!freezeList && detailPlace ? (
        <PlaceDetail
          key={detailPlace.id}
          place={detailPlace}
          city={activeCity}
          onBack={() => {
            if (isMobileSheet) sheet.changeSheetLevel('half');
            onClearSelection();
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

            {/* Categories and search share one row: the field unrolls over the tabs from the toggle. */}
            <div
              ref={filterBarRef}
              className={`v2-filter-bar${searchOpen ? ' is-searching' : ''}`}
              style={
                rule
                  ? ({ '--rule-x': `${rule.x}px`, '--rule-scale': rule.scale, '--tab-shift': `${rule.shift}px` } as CSSProperties)
                  : undefined
              }>
              <div className="v2-filter-stage">
                <div
                  className="v2-filters"
                  role="group"
                  aria-label="Filter places by category"
                  ref={(element) => {
                    if (element) element.inert = searchOpen;
                  }}>
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

                <div
                  id="v2-search-panel"
                  className={`v2-search${query ? ' has-value' : ''}`}
                  role="search"
                  ref={(element) => {
                    if (element) element.inert = !searchOpen;
                  }}
                  onMouseDown={(event) => {
                    if (
                      event.target === event.currentTarget ||
                      (event.target as Element).closest('svg, kbd, .v2-search-category')
                    ) {
                      event.preventDefault();
                      searchRef.current?.focus();
                    }
                  }}>
                  <label
                    htmlFor="v2-search-input"
                    className="v2-visually-hidden">
                    Search places or architects
                  </label>
                  <Icon name="search" />
                  <input
                    id="v2-search-input"
                    ref={searchRef as Ref<HTMLInputElement>}
                    type="search"
                    enterKeyHint="search"
                    value={query}
                    onChange={(event) => {
                      onSetQuery(event.target.value);
                      if (selectedPlaceId) onClearSelection(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      event.stopPropagation();
                      closeSearch(true);
                    }}
                    placeholder="Place or architect"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="v2-search-category"
                  />
                  <span
                    id="v2-search-category"
                    className="v2-search-category">
                    {categoryLabel}
                  </span>
                </div>
              </div>

              <span
                className={`v2-filter-rule${rule ? '' : ' is-unmarked'}`}
                aria-hidden="true"
              />

              <button
                ref={searchToggleRef}
                className="v2-search-toggle"
                type="button"
                aria-expanded={searchOpen}
                aria-controls="v2-search-panel"
                aria-label={searchOpen ? 'Close search' : 'Search places'}
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
                <Icon name="search" />
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div
            ref={resultsRef}
            className="v2-results"
            role="region"
            aria-label="Places list"
            aria-live="polite"
            aria-busy={cityPending}>
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
                          onSelect={onSelectPlace}
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
