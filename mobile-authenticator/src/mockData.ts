// Datos de ejemplo del dashboard (no hay backend financiero: solo el login con MFA es real).

export type Currency = 'USD' | 'EUR' | 'COP' | 'JPY';

export const CURRENCIES: Currency[] = ['USD', 'EUR', 'COP', 'JPY'];

// Unidades por 1 USD
export const RATES: Record<Currency, number> = { USD: 1, EUR: 0.92, COP: 4012.5, JPY: 149.8 };

export const CURRENCY_NAMES: Record<Currency, string> = {
  USD: 'Dólar estadounidense',
  EUR: 'Euro',
  COP: 'Peso colombiano',
  JPY: 'Yen japonés',
};

export const WALLETS: { currency: Currency; balance: number; change: number }[] = [
  { currency: 'USD', balance: 12480.55, change: 0 },
  { currency: 'EUR', balance: 3920.1, change: -0.12 },
  { currency: 'COP', balance: 18450000, change: 0.42 },
  { currency: 'JPY', balance: 412000, change: 0.31 },
];

export const HOLDINGS: { name: string; detail: string; valueUsd: number; change: number }[] = [
  { name: 'S&P 500', detail: '31,4 participaciones del ETF', valueUsd: 14250, change: 1.24 },
  { name: 'Nikkei 225', detail: '220 participaciones del ETF', valueUsd: 6830.4, change: -0.38 },
  { name: 'TES 2030', detail: 'Bono soberano Colombia', valueUsd: 5120, change: 0.05 },
  { name: 'Oro', detail: '1,02 onzas troy', valueUsd: 2410.75, change: 0.82 },
];

export const PAIRS: { pair: string; rate: number; decimals: number; change: number; seed: number }[] = [
  { pair: 'USD/COP', rate: 4012.5, decimals: 2, change: 0.42, seed: 3 },
  { pair: 'EUR/USD', rate: 1.087, decimals: 4, change: -0.12, seed: 7 },
  { pair: 'USD/JPY', rate: 149.8, decimals: 2, change: 0.31, seed: 11 },
  { pair: 'EUR/COP', rate: 4361.6, decimals: 2, change: 0.29, seed: 19 },
];

export const MOVEMENTS: { title: string; date: string; amount: number; currency: Currency }[] = [
  { title: 'Conversión de USD a COP', date: 'Hoy, 09:42', amount: 2000000, currency: 'COP' },
  { title: 'Compra S&P 500', date: 'Ayer, 15:10', amount: -1500, currency: 'USD' },
  { title: 'Dividendo Nikkei 225', date: '21 oct', amount: 3150, currency: 'JPY' },
  { title: 'Recarga desde Bancolombia', date: '19 oct', amount: 2500000, currency: 'COP' },
  { title: 'Pago en Tokio', date: '17 oct', amount: -18400, currency: 'JPY' },
];

export const PERIODS = ['1S', '1M', '6M', '1A'] as const;
export type Period = (typeof PERIODS)[number];
const PERIOD_POINTS: Record<Period, number> = { '1S': 7, '1M': 30, '6M': 26, '1A': 52 };

/** Caminata aleatoria determinista para que las gráficas no cambien en cada render. */
export function series(seed: number, points: number, end: number, volatility = 0.012): number[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const values = [end];
  for (let i = 1; i < points; i++) values.unshift(values[0] * (1 - (rand() - 0.47) * volatility * 2));
  return values;
}

export const totalUsd = () =>
  WALLETS.reduce((sum, w) => sum + w.balance / RATES[w.currency], 0) + HOLDINGS.reduce((sum, h) => sum + h.valueUsd, 0);

export const portfolioSeries = (period: Period) => series(42 + PERIOD_POINTS[period], PERIOD_POINTS[period], totalUsd(), 0.01);

const DECIMALS: Record<Currency, number> = { USD: 2, EUR: 2, COP: 0, JPY: 0 };

export function money(value: number, currency: Currency, withCode = true): string {
  const n = new Intl.NumberFormat('es-CO', { minimumFractionDigits: DECIMALS[currency], maximumFractionDigits: DECIMALS[currency] }).format(Math.abs(value));
  return `${value < 0 ? '−' : ''}${withCode ? currency + ' ' : ''}${n}`;
}

export function number(value: number, decimals: number): string {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function changeLabel(change: number): string {
  if (change === 0) return '0,00 %';
  return `${change > 0 ? '▲' : '▼'} ${number(Math.abs(change), 2)} %`;
}
