/**
 * Design tokens: focused and mature, for SAT, ACT, GMAT and adult learners.
 * Cool off-white paper and white cards, near-black ink, one deep blue for
 * actions, gold only for proven (Secure) skills, and green and brick for right
 * and wrong. Colour is restrained: the board and the numbers carry the screen.
 * Every text/surface pair used for text is at least 4.5:1 (checked when the
 * palette was set; recheck if you change a value).
 *
 * Type: Inter for headings and text, and Atkinson Hyperlegible for every number
 * on tiles, keypads and answers, so 1/7 and 6/8 stay unmistakable.
 */
export const color = {
  paper: '#F6F7F9',
  paperDeep: '#ECEEF2',
  surface: '#FFFFFF',
  ink: '#14181F',
  inkSoft: '#414955',
  inkFaint: '#5B6472',
  rule: '#E2E5EB',
  ruleStrong: '#C5CBD5',
  action: '#2B4ACB',
  actionDeep: '#1F3799',
  actionWash: '#E8EDFC',
  /** Proven skills only. */
  gold: '#7A5810',
  goldBright: '#C29433',
  goldWash: '#F6EEDC',
  right: '#1E6E47',
  rightWash: '#E3F2EA',
  wrong: '#A33A2E',
  wrongWash: '#FBE7E4',
  /** Quiet panels (the recommendation, coverage). */
  panel: '#EEF1F6',
  white: '#FFFFFF',
} as const;

export const font = {
  display: 'Inter_700Bold',
  heading: 'Inter_600SemiBold',
  label: 'Inter_600SemiBold',
  body: 'Inter_400Regular',
  bodyBold: 'Inter_600SemiBold',
  /** Numbers on tiles, keypads and typed answers. */
  num: 'AtkinsonHyperlegible_700Bold',
  numRegular: 'AtkinsonHyperlegible_400Regular',
} as const;

/** Type scale (mobile first). Sizes in px. */
export const type = {
  display: { fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: color.ink },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: color.ink },
  heading: { fontFamily: font.heading, fontSize: 18, lineHeight: 24, letterSpacing: -0.2, color: color.ink },
  label: { fontFamily: font.label, fontSize: 15, lineHeight: 20, color: color.ink },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24, color: color.ink },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkSoft },
  micro: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: color.inkFaint },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** A quiet edge under cards and keys, so controls read as pressable. */
export const depth = { card: '#DFE3EA', key: '#D3D8E1' } as const;

/** Content column width on tablets and web. */
export const MAX_WIDTH = 600;
