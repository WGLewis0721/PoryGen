// Responsive AVIF/WebP picture for the generated editorial imagery in
// public/images (see VISUAL-PLAN.md for sources, sizes, and licensing).

interface Variant {
  name: string;
  widths: number[];
}

export interface PictureProps {
  landscape: Variant;
  /** Optional art-directed crop for narrow screens. */
  portrait?: Variant;
  portraitMaxWidth?: number;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

function srcset(variant: Variant, format: "avif" | "webp"): string {
  return variant.widths.map((w) => `/images/${variant.name}-${w}.${format} ${w}w`).join(", ");
}

export function Picture({ landscape, portrait, portraitMaxWidth = 640, alt, width, height, sizes = "100vw", priority, className }: PictureProps) {
  const fallbackWidth = landscape.widths[Math.min(1, landscape.widths.length - 1)];
  return (
    <picture className={className}>
      {portrait && (
        <>
          <source media={`(max-width: ${portraitMaxWidth}px)`} type="image/avif" srcSet={srcset(portrait, "avif")} sizes={sizes} />
          <source media={`(max-width: ${portraitMaxWidth}px)`} type="image/webp" srcSet={srcset(portrait, "webp")} sizes={sizes} />
        </>
      )}
      <source type="image/avif" srcSet={srcset(landscape, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcset(landscape, "webp")} sizes={sizes} />
      <img
        src={`/images/${landscape.name}-${fallbackWidth}.webp`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}
