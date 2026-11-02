/**
 * Design tokens. An engineer's notebook rather than a kids' game: cool
 * grey-green paper, graphite ink, cobalt for actions, brass for proof of
 * mastery, verdigris and brick for right and wrong. The one bold element is the
 * number tile, a chunky keycap you press.
 */
export const color = {
  paper: '#EDF0EA',
  paperDeep: '#E2E7DE',
  surface: '#F8FAF6',
  ink: '#1C2430',
  inkSoft: '#495466',
  inkFaint: '#7A8494',
  rule: '#CBD3C7',
  ruleStrong: '#AEB8AA',
  cobalt: '#2446C8',
  cobaltDeep: '#18318F',
  cobaltWash: '#DDE4F7',
  brass: '#9C6F12',
  brassBright: '#B9851C',
  brassWash: '#F2E5C4',
  verdigris: '#2A7660',
  verdigrisWash: '#D5EAE1',
  brick: '#A9403A',
  brickWash: '#F3DAD6',
  white: '#FFFFFF',
} as const;

export const font = {
  display: 'Archivo_800ExtraBold',
  heading: 'Archivo_700Bold',
  label: 'Archivo_600SemiBold',
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
} as const;

/** Type scale (mobile first). Sizes in px, line heights tuned per face. */
export const type = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, color: color.ink },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.4, color: color.ink },
  heading: { fontFamily: font.heading, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, color: color.ink },
  label: { fontFamily: font.label, fontSize: 15, lineHeight: 20, color: color.ink },
  body: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  small: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.inkSoft },
  micro: { fontFamily: font.body, fontSize: 13, lineHeight: 17, color: color.inkFaint },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Content column width on tablets and web. */
export const MAX_WIDTH = 560;
