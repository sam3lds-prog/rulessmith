import type { NumPredicate } from './types';

/** Group digits with commas from five digits up (4,872 stays readable either way). */
export function fmt(n: string | number | bigint): string {
  const s = n.toString();
  const neg = s.startsWith('-');
  const digits = neg ? s.slice(1) : s;
  if (digits.length < 5) return s;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

export function formatTuple(t: number[], names: string[]): string {
  if (t.length === 1) return `${names[0] ?? 'n'} = ${fmt(t[0])}`;
  return t.map((v, i) => `${names[i] ?? (i === 0 ? 'a' : 'b')} = ${fmt(v)}`).join(', ');
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

export const sup = (n: number) => String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');

export function factorLabel(factors: [number, number][]): string {
  return factors.map(([p, e]) => (e === 1 ? `${p}` : `${p}${sup(e)}`)).join(' × ');
}

export function describe(p: NumPredicate): string {
  switch (p.op) {
    case 'div':
      return `divisible by ${p.d}`;
    case 'rem':
      return `leaves remainder ${p.r} when divided by ${p.d}`;
    case 'prime':
      return 'prime';
    case 'square':
      return 'a perfect square';
    case 'nDivisors':
      return `has exactly ${p.k} factors`;
    case 'not':
      if (p.p.op === 'div') return `not divisible by ${p.p.d}`;
      return `not ${describe(p.p)}`;
    case 'and':
      return joinWords(p.ps.map(describeShort));
    case 'or':
      return p.ps.map(describe).join(' or ');
  }
}

/** Compact form for lists: "divisible by 6, divisible by 9, not by 4" reads poorly, so trim repeats. */
function describeShort(p: NumPredicate): string {
  return describe(p);
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) {
    // "divisible by 5 and not divisible by 10" → "divisible by 5 but not by 10"
    const [a, b] = parts;
    if (a.startsWith('divisible by') && b.startsWith('not divisible by')) {
      return `${a} but not by ${b.replace('not divisible by ', '')}`;
    }
    if (a.startsWith('divisible by') && b.startsWith('divisible by')) {
      return `divisible by ${a.replace('divisible by ', '')} and by ${b.replace('divisible by ', '')}`;
    }
    return `${a} and ${b}`;
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
