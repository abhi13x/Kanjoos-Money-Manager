// types/finance.ts
// Note: the canonical domain types (Account, Transaction, Category) live in src/db/schema.ts.
// This module only owns currency/money formatting utilities.

/** ISO currency codes with no fractional sub-units (the unit itself is the smallest step). */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG']);

/** ISO currency codes with 1000 sub-units per major unit (e.g. Kuwaiti dinar → fils). */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Sub-units per major unit: INR/USD/EUR → 100, JPY/KRW → 1, KWD/BHD → 1000. */
const subUnitsPerUnit = (currency: string): number => {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 1;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 1000;
  return 100;
};

/**
 * Converts a floating-point display amount (12.50) into integer sub-units
 * (1250 paise/cents, 13 yen, 12500 fils). Safe for all supported currency classes.
 */
export const toCents = (amount: number, currency = 'INR'): number =>
  Math.round(amount * subUnitsPerUnit(currency));

/** Converts integer sub-units (1250) back to a floating-point display amount (12.50). */
export const fromCents = (cents: number, currency = 'INR'): number =>
  cents / subUnitsPerUnit(currency);

const getFallbackLocale = (currency: string): string => {
  const code = currency.toUpperCase();
  const localeMap: Record<string, string> = {
    INR: 'en-IN',
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    JPY: 'ja-JP',
    CAD: 'en-CA',
    AUD: 'en-AU',
  };
  return localeMap[code] || 'en-US';
};

const formatterCache = new Map<string, Intl.NumberFormat>();

export const formatCurrency = (cents: number, currency = 'INR', locale?: string): string => {
  const upperCurrency = currency.toUpperCase();
  const targetLocale = locale || getFallbackLocale(upperCurrency);
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(upperCurrency)
    ? 0
    : THREE_DECIMAL_CURRENCIES.has(upperCurrency)
      ? 3 // FIX: was forced to 2, rounding away the third decimal (fils)
      : 2;
  const cacheKey = `${targetLocale}:${upperCurrency}`;

  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: upperCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(cacheKey, formatter);
  }

  return formatter.format(fromCents(cents, upperCurrency));
};