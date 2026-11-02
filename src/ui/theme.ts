/**
 * Design tokens: a warm workshop of mathematical ideas. Ivory paper and white
 * cards, teal for actions (with a darker pressed edge), restrained gold only
 * for earned milestones, calm green and brick for right and wrong, and muted
 * topic accents. Every text/surface pair used for text is at least 4.5:1
 * (checked when the palette was set; recheck if you change a value).
 *
 * Type: Fredoka for headings, Nunito Sans for text, and Atkinson Hyperlegible
 * for numbers on tiles, keypads and answers, so 1/7 and 6/8 stay unmistakable.
 */
export const color = {
  paper: '#FBF8F1',
  paperDeep: '#F1EBDD',
  surface: '#FFFFFF',
  ink: '#23302E',
  inkSoft: '#4D5A57',
  inkFaint: '#616C68',
  rule: '#E6DFCF',
  ruleStrong: '#CFC6B2',
  action: '#257368',
  actionDeep: '#1D5C54',
  actionWash: '#E1EFEC',
  gold: '#7E5A12',
  goldBright: '#C99A3B',
  goldWash: '#F6E9CF',
  right: '#2D6E4E',
  rightWash: '#E3F0E6',
  wrong: '#A2463A',
  wrongWash: '#F7E1DC',
  /** Warm panels and the companion. */
  warmth: '#F5E6CC',
  /** Hero panels and growth. */
  growth: '#E5EFE6',
  white: '#FFFFFF',
  /** Topic accents (decoration only, never text). */
  lilac: '#CFC2E8',
  sky: '#CBE3EA',
  sage: '#C9DCC4',
  apricot: '#F4D3A8',
} as const;

export const font = {
  display: 'Fredoka_700Bold',
  heading: 'Fredoka_600SemiBold',
  label: 'NunitoSans_700Bold',
  body: 'NunitoSans_400Regular',
  bodyBold: 'NunitoSans_700Bold',
  /** Numbers on tiles, keypads and typed answers. */
  num: 'AtkinsonHyperlegible_700Bold',
  numRegular: 'AtkinsonHyperlegible_400Regular',
} as const;

/** Type scale (mobile first). Sizes in px, line heights tuned per face. */
export const type = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.4, color: color.ink },
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 33, letterSpacing: -0.2, color: color.ink },
  heading: { fontFamily: font.heading, fontSize: 20, lineHeight: 26, color: color.ink },
  label: { fontFamily: font.label, fontSize: 15, lineHeight: 20, color: color.ink },
  body: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  small: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.inkSoft },
  micro: { fontFamily: font.body, fontSize: 13, lineHeight: 17, color: color.inkFaint },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/** Soft warm depth under cards and keys. */
export const depth = { card: '#E9E1CF', key: '#DDD3BE' } as const;

/** Content column width on tablets and web. */
export const MAX_WIDTH = 560;
