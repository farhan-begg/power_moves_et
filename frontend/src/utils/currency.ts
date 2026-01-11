// src/utils/currency.ts

/**
 * Format a number as currency with full precision.
 * @param amount - The number to format
 * @param currency - ISO 4217 currency code (default: "USD")
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatMoney(amount: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code is invalid
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2 });
  }
}

/**
 * Format a number as compact currency (e.g., "$1.2K", "$3.4M").
 * @param amount - The number to format
 * @param currency - ISO 4217 currency code (default: "USD")
 * @returns Compact formatted string
 */
export function formatCompact(amount: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    // Fallback
    if (Math.abs(amount) >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Format a number as a percentage.
 * @param value - The decimal value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "15.0%")
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
