/**
 * Product catalog, matching the plan's price ladder. Store product ids must be
 * created with these exact ids in App Store Connect and Google Play Console,
 * and mapped to entitlements in RevenueCat (docs/MONETIZATION.md).
 */
import type { TrackId } from '../content/curriculum';

export type ProductType = 'auto_renewable' | 'non_renewing' | 'non_consumable';

export interface Product {
  id: string;
  type: ProductType;
  title: string;
  price: string;
  /** For subscriptions and passes. */
  period?: 'month' | 'year';
  durationDays?: number;
  trialDays?: number;
  /** For topic packs: the tracks they unlock. */
  tracks?: TrackId[];
  /** Challenge pack: levels 8 to 10 in Challenge mode. */
  unlocksChallenge?: boolean;
  blurb: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'premium_annual',
    type: 'auto_renewable',
    title: 'Premium, yearly',
    price: '$59.99',
    period: 'year',
    trialDays: 14,
    blurb: 'Every track, every level, every pack. 14 days free, then $59.99 a year.',
  },
  {
    id: 'premium_monthly',
    type: 'auto_renewable',
    title: 'Premium, monthly',
    price: '$9.99',
    period: 'month',
    blurb: 'Everything in Premium, billed monthly.',
  },
  {
    id: 'exam_sprint_90d',
    type: 'non_renewing',
    title: 'Exam Sprint',
    price: '$29.99',
    durationDays: 90,
    blurb: 'Premium for 90 days, paid once. Does not renew.',
  },
  {
    id: 'pack_number_properties',
    type: 'non_consumable',
    title: 'Number Properties Mastery',
    price: '$4.99',
    tracks: ['div', 'pf'],
    blurb: 'Divisibility plus primes and factors, levels 1 to 7, unlimited runs. Yours to keep.',
  },
  {
    id: 'pack_remainders',
    type: 'non_consumable',
    title: 'Remainders Mastery',
    price: '$4.99',
    tracks: ['rem'],
    blurb: 'Every remainders skill, levels 1 to 7, unlimited runs. Yours to keep.',
  },
  {
    id: 'pack_challenge_700',
    type: 'non_consumable',
    title: '700+ Challenge',
    price: '$6.99',
    unlocksChallenge: true,
    blurb: 'The hardest puzzles, levels 8 to 10, in Challenge mode across every track.',
  },
];

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const PREMIUM_IDS = ['premium_annual', 'premium_monthly', 'exam_sprint_90d'];
export const PACK_IDS = PRODUCTS.filter((p) => p.type === 'non_consumable').map((p) => p.id);
