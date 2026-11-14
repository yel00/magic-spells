import type { Image } from '../spotify/types';

/** Pick the smallest image that still covers `size` CSS pixels on a retina screen. */
export function pickImage(images: Image[] | null | undefined, size: number): string | undefined {
  if (!images?.length) return undefined;
  const want = size * 2;
  const sized = images.filter((i) => i.width).sort((a, b) => a.width! - b.width!);
  return (sized.find((i) => i.width! >= want) || sized[sized.length - 1] || images[0]).url;
}

export function Art({
  images,
  size,
  round,
  className = '',
}: {
  images: Image[] | null | undefined;
  size: number;
  round?: boolean;
  className?: string;
}) {
  const src = pickImage(images, size);
  const cls = `art ${round ? 'art-round' : ''} ${className}`;
  return src ? (
    <img className={cls} src={src} alt="" loading="lazy" decoding="async" draggable={false} />
  ) : (
    <div className={`${cls} art-empty`} />
  );
}
