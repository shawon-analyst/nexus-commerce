'use client';

import * as React from 'react';
import { useCartStore } from '@/store/cart-store';

/**
 * Rehydrates the persisted cart **after** mount.
 * `skipHydration` is used in the store so the server HTML and the first client
 * render agree, which keeps React from reporting a hydration mismatch.
 */
export function CartHydrator({ children }: { children: React.ReactNode }) {
  const setHydrated = useCartStore((s) => s.setHydrated);

  React.useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) setHydrated(true);
    };

    try {
      const result = useCartStore.persist?.rehydrate?.() as unknown;
      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).then(done, done);
      } else {
        done();
      }
    } catch {
      done();
    }

    return () => {
      cancelled = true;
    };
  }, [setHydrated]);

  return <>{children}</>;
}
