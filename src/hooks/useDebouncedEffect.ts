import { useEffect, useRef } from 'react';

/**
 * Runs `effect` `delayMs` after the last change to `deps`, skipping the very
 * first (mount) run -- so restoring an existing value into state doesn't
 * immediately re-save it, and typing only writes once things pause instead of
 * on every keystroke.
 */
export function useDebouncedEffect(effect: () => void, deps: unknown[], delayMs: number) {
  const mounted = useRef(false);
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(() => effectRef.current(), delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
