import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { placeByline, type CuratedPlace, type PlacePhoto } from '../places';
import { listPhotoUrl } from './photoUtils';
import { Icon, V2Image } from './ui';

// A card is a preview, not a gallery: a handful of frames is enough to decide whether to open the place.
const MAX_CARD_PHOTOS = 6;
// A smooth scroll to the next frame takes about this long; scroll events inside it are ours, not the user's.
const SCROLL_SETTLE_MS = 450;
// After the last arrow press, a click on the photo is almost certainly a stray one from rapid clicking.
const STRAY_CLICK_MS = 700;

function cardPhotos(place: CuratedPlace): PlacePhoto[] {
  const photos = place.photos.length ? place.photos : place.photo ? [place.photo] : [];
  return photos.slice(0, MAX_CARD_PHOTOS);
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PlaceCard({
  place,
  highlighted,
  located,
  onLocate,
  onSelect,
  onMouseEnter,
  onMouseLeave
}: {
  place: CuratedPlace;
  highlighted: boolean;
  /** The map is showing this place with its popup. */
  located: boolean;
  onLocate: (place: CuratedPlace) => void;
  onSelect: (place: CuratedPlace) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const photos = cardPhotos(place);
  const count = photos.length;
  const hasGallery = count > 1;
  const byline = placeByline(place);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // The frame the carousel is heading to. State lags behind a smooth scroll, so rapid clicks read this instead.
  const targetRef = useRef(0);
  const settleAtRef = useRef(0);
  const strayUntilRef = useRef(0);
  const [index, setIndex] = useState(0);
  // Slides past this count are not rendered yet, so a card only downloads the photos someone looks at.
  const [reach, setReach] = useState(1);

  const goTo = useCallback(
    (next: number) => {
      const track = trackRef.current;
      if (!track) return;
      const target = Math.min(count - 1, Math.max(0, next));
      targetRef.current = target;
      settleAtRef.current = Date.now() + SCROLL_SETTLE_MS;
      setIndex(target);
      setReach((current) => Math.max(current, target + 2));
      track.scrollTo({ left: target * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    [count]
  );

  const onScroll = useCallback(() => {
    // Mid-animation positions would overwrite the target of a click that is still travelling.
    if (Date.now() < settleAtRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    targetRef.current = next;
    setIndex(next);
    setReach((current) => Math.max(current, next + 2));
  }, []);

  const step = (delta: number) => {
    strayUntilRef.current = Date.now() + STRAY_CLICK_MS;
    goTo(targetRef.current + delta);
  };

  // Clicking the photo opens the place, but not in the wake of an arrow press.
  const openFromPhoto = () => {
    if (Date.now() < strayUntilRef.current) return;
    onSelect(place);
  };

  // The title button is the card's keyboard stop; the arrows are for pointers, so left/right lives here.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!hasGallery || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    if (!(event.target as Element).closest('.v2-place-hit')) return;
    event.preventDefault();
    goTo(targetRef.current + (event.key === 'ArrowRight' ? 1 : -1));
  };

  // Arrows stay mounted at both ends (dimmed, not removed). A button that vanishes under the cursor
  // sends the next click through to the photo, which opens the place.
  const arrow = (direction: 'prev' | 'next') => {
    const atEdge = direction === 'prev' ? index <= 0 : index >= count - 1;
    return (
      <button
        className={`v2-place-nav is-${direction}`}
        type="button"
        tabIndex={-1}
        aria-label={`${direction === 'prev' ? 'Previous' : 'Next'} photo of ${place.title}`}
        aria-disabled={atEdge}
        onPointerDown={(event) => {
          event.stopPropagation();
          strayUntilRef.current = Date.now() + STRAY_CLICK_MS;
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (atEdge) {
            strayUntilRef.current = Date.now() + STRAY_CLICK_MS;
            return;
          }
          step(direction === 'prev' ? -1 : 1);
        }}
        onDoubleClick={(event) => event.stopPropagation()}>
        <Icon name={direction === 'prev' ? 'chevron-left' : 'chevron-right'} />
      </button>
    );
  };

  return (
    <article
      id={`v2-place-${place.id}`}
      className={`v2-place-row${highlighted ? ' is-highlighted' : ''}${located ? ' is-located' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}>
      <div
        className={`v2-place-thumb tone-${place.placeholderTone}`}
        role={hasGallery ? 'group' : undefined}
        aria-roledescription={hasGallery ? 'carousel' : undefined}
        aria-label={hasGallery ? `Photos of ${place.title}` : undefined}
        onPointerEnter={() => setReach((current) => Math.max(current, 2))}
        onClick={openFromPhoto}>
        {count > 0 ? (
          <div
            ref={trackRef}
            className="v2-place-track"
            onScroll={hasGallery ? onScroll : undefined}>
            {photos.map((photo, photoIndex) => (
              <div
                key={photo.page || photoIndex}
                className="v2-place-slide"
                aria-hidden={hasGallery && photoIndex !== index}>
                {photoIndex < reach ? (
                  <V2Image
                    src={listPhotoUrl(photo)}
                    draggable={false}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <button
          className="v2-place-locate"
          type="button"
          tabIndex={-1}
          aria-pressed={located}
          aria-label={`Show ${place.title} on the map`}
          title="Show on map"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            // Like the arrows, this must not fall through to the photo, which opens the place.
            event.stopPropagation();
            onLocate(place);
          }}
          onDoubleClick={(event) => event.stopPropagation()}>
          <Icon name="pin" />
        </button>

        {hasGallery ? (
          <>
            {arrow('prev')}
            {arrow('next')}
            <span
              className="v2-place-dots"
              aria-hidden="true">
              {photos.map((photo, dotIndex) => (
                <i
                  key={photo.page || dotIndex}
                  className={dotIndex === index ? 'is-active' : ''}
                />
              ))}
            </span>
          </>
        ) : null}
      </div>
      <span className="v2-place-copy">
        <button
          className="v2-place-hit"
          type="button"
          onClick={() => onSelect(place)}>
          <strong title={place.title}>{place.title}</strong>
        </button>
        {byline ? <span className="v2-place-byline">{byline}</span> : null}
      </span>
    </article>
  );
}
