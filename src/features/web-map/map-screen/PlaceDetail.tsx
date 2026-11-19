import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { CATEGORY_META, type CuratedCity, type CuratedPlace } from '../places';
import { AppMenu } from './AppMenu';
import { isKeyboardNavigation } from './inputModality';
import { commonsSearchUrl, googleMapsUrl, uniqueSources } from './photoUtils';
import { Icon, PhotoCredit, V2Image } from './ui';

function PopupPlaceholder({ place, city }: { place: CuratedPlace; city: CuratedCity }) {
  return (
    <div className="v2-popup-media is-empty">
      <div className="v2-popup-empty-copy">
        <span className="v2-popup-empty-icon">
          <Icon name="location" />
        </span>
        <span>
          <strong>No photo yet</strong>
          <a
            href={commonsSearchUrl(place, city)}
            target="_blank"
            rel="noreferrer">
            Search on Wikimedia Commons
          </a>
        </span>
      </div>
    </div>
  );
}

export function PlaceDetail({
  place,
  city,
  previousPlace,
  nextPlace,
  placePosition,
  placeCount,
  onNavigatePlace,
  onBack,
  onOpenPhoto,
  onOpenMenu,
  onOpenAbout,
  onOpenContact
}: {
  place: CuratedPlace;
  city: CuratedCity;
  previousPlace: CuratedPlace | null;
  nextPlace: CuratedPlace | null;
  placePosition: number | null;
  placeCount: number;
  onNavigatePlace: (place: CuratedPlace) => void;
  onBack: () => void;
  onOpenPhoto: (index: number) => void;
  onOpenMenu: () => void;
  onOpenAbout: () => void;
  onOpenContact: () => void;
}) {
  const backRef = useRef<HTMLButtonElement | null>(null);
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClickRef = useRef(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Record<number, boolean>>({});
  const [dragOffset, setDragOffset] = useState(0);
  const [thumbOverflow, setThumbOverflow] = useState({ start: false, end: false });
  const photos = place.photos;
  const photoCount = photos.length;
  const photo = photos[photoIndex];
  const showPhoto = Boolean(photo) && !failedPhotos[photoIndex];
  const hasGallery = photoCount > 1;
  const category = CATEGORY_META[place.category];
  const publishers = uniqueSources(place.sources);

  const updateThumbOverflow = useCallback(() => {
    const el = thumbsRef.current;
    if (!el) return;
    setThumbOverflow({
      start: el.scrollLeft > 6,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 6
    });
  }, []);

  const stepPhoto = useCallback(
    (delta: number) => {
      setPhotoIndex((current) => Math.min(photoCount - 1, Math.max(0, current + delta)));
    },
    [photoCount]
  );

  useEffect(() => {
    // A list click unmounts the clicked row; keep keyboard focus inside the panel.
    if (!isKeyboardNavigation()) return;
    if (!document.activeElement || document.activeElement === document.body)
      backRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;
    updateThumbOverflow();
    const onScroll = () => updateThumbOverflow();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(updateThumbOverflow);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [photoCount, updateThumbOverflow]);

  useEffect(() => {
    const thumbs = thumbsRef.current;
    const active = thumbs?.querySelector<HTMLElement>('.is-active');
    if (thumbs && active) {
      thumbs.scrollTo({ left: active.offsetLeft - (thumbs.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
    }
    const frame = requestAnimationFrame(updateThumbOverflow);
    return () => cancelAnimationFrame(frame);
  }, [photoIndex, updateThumbOverflow]);

  return (
    <>
      <div className="v2-detail-bar">
        <button
          ref={backRef}
          className="v2-detail-back"
          type="button"
          onClick={onBack}>
          <Icon name="arrow-left" />
          <span>All places</span>
        </button>
        <div className="v2-detail-actions">
          <span className="v2-detail-city">{city.name}</span>
          <AppMenu
            onOpen={onOpenMenu}
            onAbout={onOpenAbout}
            onContact={onOpenContact}
          />
        </div>
      </div>
      {placePosition !== null && placeCount > 1 ? (
        <nav
          className="v2-detail-sequence"
          aria-label="Move between places in the current list">
          <button
            type="button"
            disabled={!previousPlace}
            onClick={() => previousPlace && onNavigatePlace(previousPlace)}
            aria-label={previousPlace ? `Previous place: ${previousPlace.title}` : 'No previous place'}>
            <Icon name="chevron-left" />
            <span>Previous</span>
          </button>
          <span
            className="v2-detail-sequence-count"
            aria-label={`Place ${placePosition} of ${placeCount}`}>
            {placePosition} / {placeCount}
          </span>
          <button
            type="button"
            disabled={!nextPlace}
            onClick={() => nextPlace && onNavigatePlace(nextPlace)}
            aria-label={nextPlace ? `Next place: ${nextPlace.title}` : 'No next place'}>
            <span>Next</span>
            <Icon name="chevron-right" />
          </button>
        </nav>
      ) : null}

      <article
        className="v2-detail"
        aria-labelledby="v2-detail-title">
        {showPhoto && photo ? (
          hasGallery ? (
            <div
              className="v2-detail-carousel"
              role="region"
              aria-roledescription="carousel"
              aria-label={`Photos of ${place.title}`}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                stepPhoto(event.key === 'ArrowRight' ? 1 : -1);
              }}>
              <div
                ref={viewportRef}
                className="v2-detail-viewport"
                onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  dragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    axis: null
                  };
                  suppressClickRef.current = false;
                }}
                onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const dx = event.clientX - drag.startX;
                  const dy = event.clientY - drag.startY;
                  if (!drag.axis) {
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
                    if (drag.axis === 'x') event.currentTarget.setPointerCapture(event.pointerId);
                  }
                  if (drag.axis !== 'x') return;
                  suppressClickRef.current = true;
                  const atEdge = (photoIndex === 0 && dx > 0) || (photoIndex === photoCount - 1 && dx < 0);
                  setDragOffset(atEdge ? dx / 3 : dx);
                }}
                onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  dragRef.current = null;
                  if (drag.axis !== 'x') return;
                  const width = viewportRef.current?.clientWidth ?? 1;
                  const dx = event.clientX - drag.startX;
                  const threshold = Math.min(width * 0.18, 70);
                  if (dx < -threshold && photoIndex < photoCount - 1) stepPhoto(1);
                  else if (dx > threshold && photoIndex > 0) stepPhoto(-1);
                  setDragOffset(0);
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDragOffset(0);
                }}
                onClickCapture={(event) => {
                  if (!suppressClickRef.current) return;
                  suppressClickRef.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                }}>
                <div
                  className={`v2-detail-track${dragOffset ? ' is-dragging' : ''}`}
                  style={{ transform: `translate3d(calc(${-photoIndex * 100}% + ${dragOffset}px), 0, 0)` }}>
                  {photos.map((item, index) => (
                    <button
                      key={item.page || index}
                      className={`v2-detail-media v2-detail-slide tone-${place.placeholderTone}`}
                      type="button"
                      tabIndex={index === photoIndex ? 0 : -1}
                      onClick={() => onOpenPhoto(index)}
                      aria-label={`Open photo ${index + 1} of ${photoCount} of ${place.title}`}
                      aria-hidden={index !== photoIndex}>
                      {failedPhotos[index] ? (
                        <span className="v2-detail-slide-fallback">{place.title.charAt(0)}</span>
                      ) : (
                        <V2Image
                          src={item.src || item.thumb}
                          alt={index === photoIndex ? `${place.title} in ${city.name}` : ''}
                          loading={index === 0 ? 'eager' : 'lazy'}
                          draggable={false}
                          onFail={() => setFailedPhotos((current) => ({ ...current, [index]: true }))}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {photoIndex > 0 ? (
                <button
                  className="v2-detail-nav is-prev"
                  type="button"
                  onClick={() => stepPhoto(-1)}
                  aria-label="Previous photo">
                  <Icon name="chevron-left" />
                </button>
              ) : null}
              {photoIndex < photoCount - 1 ? (
                <button
                  className="v2-detail-nav is-next"
                  type="button"
                  onClick={() => stepPhoto(1)}
                  aria-label="Next photo">
                  <Icon name="chevron-right" />
                </button>
              ) : null}
              <span
                className="v2-popup-zoom has-count"
                data-label={`${photoIndex + 1} / ${photoCount}`}
                aria-hidden="true">
                <svg
                  className="v2-icon"
                  viewBox="0 0 24 24">
                  <path d="M14 4h6v6" />
                  <path d="M10 20H4v-6" />
                  <path d="m20 4-6.5 6.5" />
                  <path d="m4 20 6.5-6.5" />
                </svg>
              </span>
            </div>
          ) : (
            <button
              className={`v2-detail-media tone-${place.placeholderTone}`}
              type="button"
              onClick={() => onOpenPhoto(photoIndex)}
              aria-label={`Open larger photo of ${place.title}`}>
              <V2Image
                src={photo.src || photo.thumb}
                alt={`${place.title} in ${city.name}`}
                loading="eager"
                onFail={() => setFailedPhotos((current) => ({ ...current, [photoIndex]: true }))}
              />
              <span
                className="v2-popup-zoom"
                data-label="Expand"
                aria-hidden="true">
                <svg
                  className="v2-icon"
                  viewBox="0 0 24 24">
                  <path d="M14 4h6v6" />
                  <path d="M10 20H4v-6" />
                  <path d="m20 4-6.5 6.5" />
                  <path d="m4 20 6.5-6.5" />
                </svg>
              </span>
            </button>
          )
        ) : (
          <PopupPlaceholder
            place={place}
            city={city}
          />
        )}

        {hasGallery ? (
          <section
            className="v2-detail-gallery"
            aria-label="Photos">
            <div
              className={`v2-detail-thumbs-wrap${thumbOverflow.start ? ' has-start' : ''}${thumbOverflow.end ? ' has-end' : ''}`}>
              <div
                ref={thumbsRef}
                className="v2-detail-thumbs"
                role="group"
                aria-label="Choose a photo">
                {photos.map((item, index) => (
                  <button
                    key={item.page || index}
                    type="button"
                    className={index === photoIndex ? 'is-active' : ''}
                    onClick={() => setPhotoIndex(index)}
                    aria-label={`Show photo ${index + 1} of ${photoCount}`}
                    aria-pressed={index === photoIndex}>
                    <V2Image src={item.thumb || item.src} />
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {showPhoto && photo ? (
          <p className="v2-detail-credit">
            <PhotoCredit photo={photo} />
          </p>
        ) : null}

        <div className="v2-detail-body">
          <div className="v2-popup-kicker">{category.label}</div>
          <h2 id="v2-detail-title">{place.title}</h2>
          {place.architect || place.year || place.area ? (
            <dl className="v2-popup-meta">
              {place.architect ? (
                <div>
                  <dt>Architect</dt>
                  <dd>{place.architect}</dd>
                </div>
              ) : null}
              {place.year ? (
                <div>
                  <dt>Year</dt>
                  <dd>{place.year}</dd>
                </div>
              ) : null}
              {place.area ? (
                <div>
                  <dt>Area</dt>
                  <dd>{place.area}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <p className="v2-detail-story">{place.why}</p>

          <a
            className="v2-popup-directions v2-detail-directions"
            href={googleMapsUrl(place)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${place.title} in Google Maps`}>
            <span className="v2-popup-directions-icon">
              <Icon name="location" />
            </span>
            <span className="v2-popup-directions-copy">
              <strong>Open in Google Maps</strong>
              <small>{place.area ? `${place.area}, ${city.name}` : city.name}</small>
            </span>
            <span className="v2-popup-directions-arrow">
              <Icon name="arrow-up-right" />
            </span>
          </a>

          {publishers.length > 0 ? (
            <section
              className="v2-detail-sources"
              aria-labelledby="v2-detail-sources-title">
              <h3 id="v2-detail-sources-title">
                Mentioned in {publishers.length} {publishers.length === 1 ? 'source' : 'sources'}
              </h3>
              <ul>
                {publishers.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer">
                      <span>
                        <b>{source.publisher}</b>
                        {source.label !== source.publisher ? <small>{source.label}</small> : null}
                      </span>
                      <Icon name="external" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </article>
    </>
  );
}
