// Identidad "Kawase" (為替, tipo de cambio). Inspirada en UNiiK: negro, blanco hueso, gris y un rojo de marca.
export const color = {
  ink: '#000000',
  paper: '#F3F3F1',
  stone: '#C9C9C6',
  ash: '#8A8A86',
  graphite: '#2A2A2A',
  red: '#D3261E',
};

export const font = {
  light: 'HankenGrotesk_300Light',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
};

// Escala tipográfica (ratio ~1.333) y cifras tabulares para montos alineados.
export const type = {
  display: { fontFamily: font.light, fontSize: 56, lineHeight: 60, letterSpacing: -2, fontVariant: ['tabular-nums' as const] },
  title: { fontFamily: font.light, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  heading: { fontFamily: font.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  figure: { fontFamily: font.regular, fontSize: 15, fontVariant: ['tabular-nums' as const] },
};

export const radius = 4;
