import {
  Camera,
  Cpu,
  Headphones,
  Home,
  Laptop,
  LayoutGrid,
  Tag,
  Utensils,
  Watch,
  type LucideIcon,
} from 'lucide-react';

/**
 * The glyph drawn beside a category name, matched on the category's slug first
 * and then its name. Presentation only: a category the map does not know falls
 * back to `Tag`, so adding one in the admin panel never breaks the strip.
 */
const ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  'all-products': LayoutGrid,
  audio: Headphones,
  electronics: Laptop,
  // the seed slug is `home-kitchen`; the `and` form covers the display name
  'home-kitchen': Home,
  'home-and-kitchen': Home,
  photography: Camera,
  wearables: Watch,
  // near-misses an admin might type, so the strip stays sensible
  computing: Cpu,
  computers: Laptop,
  kitchen: Utensils,
};

/** "Home & Kitchen" → "home-and-kitchen" (query-safe, punctuation-free). */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The icon for a category, trying each candidate (slug, then name) in turn. */
export function categoryIcon(...candidates: Array<string | null | undefined>): LucideIcon {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const icon = ICONS[normalize(candidate)];
    if (icon) return icon;
  }
  return Tag;
}
