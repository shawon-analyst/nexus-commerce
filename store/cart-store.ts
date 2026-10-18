'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_DELIVERY_AREA,
  DELIVERY_AREA_META,
  deliveryAreaMeta,
  deliveryFeeFor,
  type DeliveryArea,
} from '@/lib/utils';

export type CartLine = {
  productId: string;
  title: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  /** stock snapshot taken when the item was added — used for client-side guards */
  stock: number;
};

type CartState = {
  lines: CartLine[];
  isOpen: boolean;
  hydrated: boolean;
  /**
   * Where the parcel is going — chosen at checkout, but kept here so the cart
   * and its slide-out can quote the same delivery charge the checkout will.
   */
  deliveryArea: DeliveryArea;

  addLine: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  removeLine: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  clear: () => void;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  setHydrated: (value: boolean) => void;
  setDeliveryArea: (area: DeliveryArea) => void;
};

const MAX_PER_LINE = 99;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      isOpen: false,
      hydrated: false,
      deliveryArea: DEFAULT_DELIVERY_AREA,

      addLine: (line, quantity = 1) => {
        const lines = [...get().lines];
        const index = lines.findIndex((l) => l.productId === line.productId);
        const ceiling = Math.max(line.stock, 1);

        if (index >= 0) {
          const next = Math.min(lines[index].quantity + quantity, ceiling, MAX_PER_LINE);
          lines[index] = { ...lines[index], ...line, quantity: next };
        } else {
          lines.push({
            ...line,
            quantity: Math.min(Math.max(quantity, 1), ceiling, MAX_PER_LINE),
          });
        }

        set({ lines, isOpen: true });
      },

      removeLine: (productId) =>
        set({ lines: get().lines.filter((l) => l.productId !== productId) }),

      setQuantity: (productId, quantity) =>
        set({
          lines: get().lines.map((l) =>
            l.productId === productId
              ? {
                  ...l,
                  quantity: Math.min(Math.max(quantity, 1), Math.max(l.stock, 1), MAX_PER_LINE),
                }
              : l,
          ),
        }),

      increment: (productId) => {
        const line = get().lines.find((l) => l.productId === productId);
        if (line) get().setQuantity(productId, line.quantity + 1);
      },

      decrement: (productId) => {
        const line = get().lines.find((l) => l.productId === productId);
        if (!line) return;
        if (line.quantity <= 1) {
          get().removeLine(productId);
        } else {
          get().setQuantity(productId, line.quantity - 1);
        }
      },

      clear: () => set({ lines: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set({ isOpen: !get().isOpen }),
      setHydrated: (value) => set({ hydrated: value }),
      setDeliveryArea: (area) =>
        set({ deliveryArea: (area ?? DEFAULT_DELIVERY_AREA) as DeliveryArea }),
    }),
    {
      name: 'nexus-cart-v1',
      storage: createJSONStorage(() => localStorage),
      // rehydrated manually by <CartHydrator /> so SSR markup never mismatches
      skipHydration: true,
      partialize: (state) =>
        ({ lines: state.lines, deliveryArea: state.deliveryArea }) as CartState,
    },
  ),
);

/* -------------------------------------------------------------------------- */
/*  Non-hook helpers (usable inside event handlers without subscribing)       */
/* -------------------------------------------------------------------------- */

export const cartItemsCount = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.quantity, 0);

export const cartSubtotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

/*
 * Delivery pricing lives in `lib/utils` next to the currency formatter, so the
 * cart, the order record and the checkout can never disagree. Re-exported here
 * because the cart UI has always imported them from the store.
 */
export {
  DEFAULT_DELIVERY_AREA,
  DELIVERY_AREA_META,
  deliveryAreaMeta,
  deliveryFeeFor,
};
export type { DeliveryArea };

export function cartTotals(
  lines: CartLine[],
  area: string | null | undefined = DEFAULT_DELIVERY_AREA,
) {
  const subtotal = cartSubtotal(lines);
  const delivery = deliveryFeeFor(area);
  return {
    subtotal,
    delivery,
    total: subtotal + delivery,
  };
}
