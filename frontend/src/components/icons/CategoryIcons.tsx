// src/components/icons/CategoryIcons.tsx
import React from "react";

// HEROICON imports (outline)
import {
  ShoppingCartIcon,
  BanknotesIcon,
  CreditCardIcon,
  HomeIcon,
  LightBulbIcon,
  CpuChipIcon,
  MusicalNoteIcon,
  GiftIcon,
  TruckIcon,
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  HeartIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  GlobeAmericasIcon,
  FireIcon,
  Battery100Icon,
  WalletIcon,
  MapPinIcon,
  CurrencyEuroIcon,
  CurrencyPoundIcon,
  CurrencyYenIcon,
} from "@heroicons/react/24/outline";

type IconProps = { className?: string; style?: React.CSSProperties };

const norm = (s?: string) => (s || "").toLowerCase().trim();

/** Small fallback until you add a mug/cup icon */
function CupIconFallback(props: IconProps) {
  return <MusicalNoteIcon {...props} />;
}

/** keyword groups → icon */
const KEYMAP: Array<{ keys: string[]; Icon: React.ComponentType<IconProps> }> = [
  // food
  { keys: ["grocery", "groceries", "supermarket", "market"], Icon: ShoppingCartIcon },
  { keys: ["restaurant", "dining", "food", "eatery"], Icon: ShoppingBagIcon },
  { keys: ["coffee", "cafe", "starbucks"], Icon: CupIconFallback },

  // transport / travel
  { keys: ["uber", "lyft", "taxi", "ride", "transport", "bus", "metro", "train"], Icon: TruckIcon },
  { keys: ["flight", "airline", "airport", "travel"], Icon: GlobeAmericasIcon },
  { keys: ["gas", "fuel", "petrol"], Icon: FireIcon },

  // housing / utilities
  { keys: ["rent", "mortgage", "landlord", "airbnb"], Icon: HomeIcon },
  { keys: ["utility", "electric", "water", "internet", "wifi"], Icon: LightBulbIcon },

  // shopping / merchandise
  { keys: ["amazon", "shopping", "merchandise", "retail"], Icon: GiftIcon },

  // finance / payments
  { keys: ["loan", "credit", "card", "payment"], Icon: CreditCardIcon },
  { keys: ["bank", "deposit", "transfer", "wire"], Icon: BanknotesIcon },

  // income
  { keys: ["payroll", "paycheck", "salary", "wages", "income"], Icon: CurrencyDollarIcon },

  // health / fitness
  { keys: ["pharmacy", "doctor", "medical", "health"], Icon: HeartIcon },
  { keys: ["gym", "fitness", "workout"], Icon: Battery100Icon },

  // subscriptions / digital
  { keys: ["subscription", "netflix", "spotify", "software", "saas", "apple"], Icon: CpuChipIcon },

  // education
  { keys: ["tuition", "school", "university", "course", "education"], Icon: AcademicCapIcon },

  // insurance
  { keys: ["insurance", "insurer", "premium"], Icon: ShieldCheckIcon },

  // services
  { keys: ["service", "repairs", "maintenance", "cleaning"], Icon: WrenchScrewdriverIcon },

  // entertainment
  { keys: ["movie", "concert", "entertainment", "music", "theater"], Icon: MusicalNoteIcon },

  // business
  { keys: ["business", "consulting", "office", "b2b"], Icon: BuildingOfficeIcon },

  // savings / investing
  { keys: ["savings", "invest", "brokerage", "roth", "401k"], Icon: ArrowTrendingUpIcon },

  // generic money in/out
  { keys: ["refund", "reversal"], Icon: WalletIcon },

  // geo / travel leftovers
  { keys: ["hotel", "motel", "lodging"], Icon: MapPinIcon },

  // currency names (last resort)
  { keys: ["eur"], Icon: CurrencyEuroIcon },
  { keys: ["gbp"], Icon: CurrencyPoundIcon },
  { keys: ["jpy", "yen"], Icon: CurrencyYenIcon },
];

/** default icon when we can't infer */
const DefaultIcon = WalletIcon;

/** Pick a Heroicon based on category first; fallback to description keywords */
export function pickIconFor(category?: string, description?: string) {
  const c = norm(category);
  const d = norm(description);

  if (c) {
    const matched = KEYMAP.find(({ keys }) => keys.some((k) => c.includes(k)));
    if (matched) return matched.Icon;
  }
  if (d) {
    const matched = KEYMAP.find(({ keys }) => keys.some((k) => d.includes(k)));
    if (matched) return matched.Icon;
  }
  return DefaultIcon;
}

/** Convert #RRGGBB → rgba(r,g,b,alpha) */
export function hexToRgba(hex: string, alpha = 1) {
  const m = hex.replace("#", "");
  const isShort = m.length === 3;
  const r = parseInt(isShort ? m[0] + m[0] : m.slice(0, 2), 16);
  const g = parseInt(isShort ? m[1] + m[1] : m.slice(2, 4), 16);
  const b = parseInt(isShort ? m[2] + m[2] : m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Simple wrapper used in lists; accepts a color to tint the icon */
export function CategoryIcon({
  category,
  description,
  className,
  color,
}: {
  category?: string;
  description?: string;
  className?: string;
  color?: string; // NEW: tint the SVG via currentColor
}) {
  const Icon = pickIconFor(category, description);
  return <Icon className={className} style={color ? { color } : undefined} />;
}

/** Optional default palette for fallbacks */
export const DEFAULT_COLORS: Record<string, string> = {
  groceries: "#ef4444",     // red
  food: "#f97316",          // orange
  restaurants: "#f59e0b",   // amber
  coffee: "#a16207",        // dark yellow
  transport: "#3b82f6",     // blue
  travel: "#06b6d4",        // cyan
  rent: "#22c55e",          // green
  utilities: "#84cc16",     // lime
  subscriptions: "#6366f1", // indigo
  shopping: "#ec4899",      // pink
  income: "#10b981",        // emerald
  savings: "#0ea5e9",       // sky
  entertainment: "#8b5cf6", // violet
  healthcare: "#ef4444",    // red
  uncategorized: "#9ca3af", // gray
};
