"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";

interface ThumbnailProps {
  src: string;
  alt: string;
  /** Width of the image (if known) */
  width?: number;
  /** Height of the image (if known) */
  height?: number;
  /** Show blurred background in the negative space around non-square images (only applies when square=true) */
  showBlurredBackground?: boolean;
  /** Additional class names for the container */
  className?: string;
  /** Sizes attribute for responsive images */
  sizes?: string;
  /** Force square container (default true). When false, uses natural aspect ratio */
  square?: boolean;
  /** Lazy load the image (default true). Set to false to load immediately */
  lazy?: boolean;
  /** Priority loading for LCP images (default false) */
  priority?: boolean;
}

// Cache to track which images have been loaded in this session
const loadedImages = new Set<string>();

export default function Thumbnail({ src, alt, width: providedWidth, height: providedHeight, showBlurredBackground = true, className = "", sizes = "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw", square = true, lazy = true, priority = false }: ThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!lazy || priority);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(providedWidth && providedHeight ? { width: providedWidth, height: providedHeight } : null);
  // Initialize as loaded if we've seen this image before
  const [imageLoaded, setImageLoaded] = useState(() => loadedImages.has(src));

  // Intersection observer for true lazy loading
  useEffect(() => {
    if (!lazy || priority || isVisible) return;

    const element = containerRef.current;
    if (!element) return;

    // Check if already in viewport immediately (handles reordering case)
    const rect = element.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight + 200 && rect.bottom > -200;
    if (isInViewport) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "200px", // Start loading 200px before visible
        threshold: 0,
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [lazy, priority, isVisible]);

  // Load dimensions from image if not provided (only when visible)
  useEffect(() => {
    if (providedWidth && providedHeight) {
      setDimensions({ width: providedWidth, height: providedHeight });
      return;
    }

    // Only load dimensions when visible to avoid pre-loading
    if (!isVisible) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;
  }, [src, providedWidth, providedHeight, isVisible]);

  // Handle image load - mark as loaded and cache it
  const handleImageLoad = () => {
    loadedImages.add(src);
    setImageLoaded(true);
  };

  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
  const isPortrait = aspectRatio < 1;
  const isLandscape = aspectRatio > 1;
  const isSquareAspect = Math.abs(aspectRatio - 1) < 0.01;

  // Non-square mode: use natural aspect ratio
  if (!square) {
    return (
      <div ref={containerRef} className={`relative w-full overflow-hidden bg-neutral-900 ${className}`} style={{ aspectRatio: aspectRatio }}>
        {isVisible && (
          <>
            {/* Transparent background - only visible once image loads */}
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              style={{
                backgroundImage: "url(/transparent.png)",
                backgroundRepeat: "repeat",
                backgroundSize: "50%",
              }}
            />
            <Image src={src} alt={alt} fill className={`object-contain transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`} sizes={sizes} onLoad={handleImageLoad} loading="eager" priority={priority} />
          </>
        )}
      </div>
    );
  }

  // Square mode: center image within square container
  // Calculate the inner image dimensions within the square container
  // Portrait: full height, width based on aspect ratio
  // Landscape: full width, height based on aspect ratio
  // Square: full width and height
  const innerStyle: React.CSSProperties = {
    position: "relative",
    width: isPortrait ? "auto" : "100%",
    height: isLandscape ? "auto" : "100%",
    aspectRatio: aspectRatio,
  };

  return (
    <div ref={containerRef} className={`relative w-full aspect-square overflow-hidden bg-neutral-900 ${className}`}>
      {isVisible && (
        <>
          {/* Blurred background for negative space */}
          {showBlurredBackground && !isSquareAspect && <Image src={src} alt="" fill className={`object-cover blur-2xl scale-125 z-0 transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`} sizes={sizes} aria-hidden="true" loading="eager" priority={priority} />}

          {/* Centered container for the actual image */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div
              className={`transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              style={{
                ...innerStyle,
                backgroundImage: "url(/transparent.png)",
                backgroundRepeat: "repeat",
                backgroundSize: "50%",
              }}>
              <Image src={src} alt={alt} fill className="object-contain" sizes={sizes} onLoad={handleImageLoad} loading="eager" priority={priority} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
