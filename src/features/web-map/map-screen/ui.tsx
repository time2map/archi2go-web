import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { PlacePhoto } from '../places';
import type { IconName } from './config';

export const PreviewLoadingContext = createContext(false);

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    'arrow-left': (
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>
    ),
    'arrow-up-right': (
      <>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    'chevron-down': <path d="m7 10 5 5 5-5" />,
    'chevron-left': <path d="m15 6-6 6 6 6" />,
    'chevron-right': <path d="m9 6 6 6-6 6" />,
    close: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    external: (
      <>
        <path d="M14 5h5v5" />
        <path d="m10 14 9-9" />
        <path d="M19 13v6H5V5h6" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle
          cx="12"
          cy="10"
          r="2.5"
        />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    message: <path d="M4 5h16v11H10l-6 4V5Z" />,
    search: (
      <>
        <circle
          cx="11"
          cy="11"
          r="7"
        />
        <path d="m20 20-4-4" />
      </>
    ),
    // A square on a stem: the app's own map pin, reduced to lines.
    pin: (
      <>
        <rect
          x="7"
          y="3.5"
          width="10"
          height="10"
        />
        <path d="M12 13.5V21" />
      </>
    )
  };

  return (
    <svg
      className="v2-icon"
      viewBox="0 0 24 24"
      aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function V2Image({
  src,
  alt = '',
  className,
  loading = 'lazy',
  draggable,
  onReady,
  onFail
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  onReady?: () => void;
  onFail?: () => void;
}) {
  const previewLoading = useContext(PreviewLoadingContext);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(src ? 'loading' : 'error');

  useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    const node = imageRef.current;
    if (node?.complete && node.naturalWidth > 0) setStatus('ready');
  }, [src]);

  if (previewLoading)
    return (
      <span
        className="v2-skeleton"
        aria-hidden="true"
      />
    );
  if (!src || status === 'error') return null;

  return (
    <>
      {status === 'loading' ? (
        <span
          className="v2-skeleton"
          aria-hidden="true"
        />
      ) : null}
      <img
        ref={imageRef}
        className={`v2-fade-img${status === 'ready' ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
        // Photo hosts (Wikimedia, Flickr) allow CORS. An anonymous request sends no cookie,
        // and the browser keeps none of the cookies those hosts set in reply.
        crossOrigin="anonymous"
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        draggable={draggable}
        onLoad={() => {
          setStatus('ready');
          onReady?.();
        }}
        onError={() => {
          setStatus('error');
          onFail?.();
        }}
      />
    </>
  );
}

export function PhotoCredit({ photo }: { photo: PlacePhoto }) {
  return (
    <span
      className="v2-photo-credit"
      onClick={(event) => event.stopPropagation()}>
      Photo{' '}
      <a
        href={photo.page}
        target="_blank"
        rel="noreferrer">
        {photo.author || 'Unknown author'}
      </a>
      {photo.license ? (
        <>
          {', '}
          {photo.licenseUrl ? (
            <a
              href={photo.licenseUrl}
              target="_blank"
              rel="noreferrer">
              {photo.license}
            </a>
          ) : (
            photo.license
          )}
        </>
      ) : null}
    </span>
  );
}

export function PlaceListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="v2-results-skeleton v2-place-grid"
      aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <article
          key={index}
          className="v2-place-row is-skeleton">
          <span className="v2-place-thumb">
            <span className="v2-skeleton" />
          </span>
          <span className="v2-place-copy">
            <span className="v2-skel-line is-title" />
            <span className="v2-skel-line is-meta" />
          </span>
        </article>
      ))}
    </div>
  );
}

export function CityListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="is-skeleton"
          aria-hidden="true">
          <span className="v2-city-thumb">
            <span className="v2-skeleton" />
          </span>
          <span className="v2-city-option-copy">
            <span className="v2-skel-line is-title" />
            <span className="v2-skel-line is-meta" />
          </span>
          <span className="v2-skel-line is-count" />
        </li>
      ))}
    </>
  );
}
