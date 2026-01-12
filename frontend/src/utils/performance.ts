// ✅ Mobile Performance: Performance monitoring and optimization utilities

/**
 * Debounce function for mobile performance
 * Reduces function calls during rapid user interactions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for mobile performance
 * Limits function calls to once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if connection is slow (2G/3G)
 */
export function isSlowConnection(): boolean {
  if (!("connection" in navigator)) return false;
  const conn = (navigator as any).connection;
  if (!conn) return false;
  return (
    conn.effectiveType === "2g" ||
    conn.effectiveType === "slow-2g" ||
    (conn.downlink && conn.downlink < 1.5)
  );
}

/**
 * Preload critical resources
 */
export function preloadResource(href: string, as: string): void {
  const link = document.createElement("link");
  link.rel = "preload";
  link.href = href;
  link.as = as;
  document.head.appendChild(link);
}

/**
 * Lazy load images with Intersection Observer
 */
export function lazyLoadImage(img: HTMLImageElement, src: string): void {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            img.src = src;
            observer.unobserve(img);
          }
        });
      },
      { rootMargin: "50px" }
    );
    observer.observe(img);
  } else {
    // Fallback for browsers without IntersectionObserver
    img.src = src;
  }
}

/**
 * Measure performance metrics
 */
export function measurePerformance(name: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (process.env.NODE_ENV === "development") {
      console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
    }
    // Send to analytics in production
    if (process.env.NODE_ENV === "production" && duration > 1000) {
      // Log slow operations
      console.warn(`⚠️ Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }
  };
}

/**
 * Optimize scroll performance
 */
export function optimizeScroll(element: HTMLElement): () => void {
  let ticking = false;
  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        // Scroll handling logic here
        ticking = false;
      });
      ticking = true;
    }
  };
  element.addEventListener("scroll", handleScroll, { passive: true });
  return () => element.removeEventListener("scroll", handleScroll);
}
