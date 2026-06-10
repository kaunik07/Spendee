export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$',    name: 'US Dollar' },
  { code: 'EUR', symbol: '€',    name: 'Euro' },
  { code: 'GBP', symbol: '£',    name: 'British Pound' },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$',   name: 'Canadian Dollar' },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar' },
  { code: 'AED', symbol: 'AED',  name: 'UAE Dirham' },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso' },
  { code: 'THB', symbol: '฿',    name: 'Thai Baht' },
  { code: 'CHF', symbol: 'CHF',  name: 'Swiss Franc' },
];

export function getCurrencyByCode(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
