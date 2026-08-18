/** Motion environment guards. Safe on the server (return conservative defaults). */
export const reduceMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/** Motion is allowed only on non-reduced-motion environments. */
export const motionOK = (): boolean => typeof window !== "undefined" && !reduceMotion();
