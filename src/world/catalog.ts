/**
 * The workshop: its districts (one per topic) and the objects a learner can
 * earn or buy. Pure data, versioned. Cosmetic progress is never evidence of
 * learning: nothing here is read by the mastery rules.
 */
import type { TrackId } from '../content/curriculum';

export const CATALOG_VERSION = 1;

export interface District {
  id: string;
  name: string;
  /** What gets built there. */
  creation: string;
  /** The topic track it teaches, if released. */
  track?: TrackId;
  status: 'released' | 'planned';
  /** Decoration only. */
  accent: 'sage' | 'apricot' | 'sky' | 'lilac';
}

export const DISTRICTS: District[] = [
  { id: 'gatehouse', name: 'Gatehouse', creation: 'Build routing gates and a number lock', track: 'div', status: 'released', accent: 'sage' },
  { id: 'foundry', name: 'Factor Foundry', creation: 'Assemble factor mechanisms', track: 'pf', status: 'released', accent: 'apricot' },
  { id: 'harbor', name: 'Clockwork Harbor', creation: 'Restore repeating rails and dials', track: 'rem', status: 'released', accent: 'sky' },
  { id: 'mosaic', name: 'Mosaic Studio', creation: 'Fill exact areas and repair patterns (fractions and decimals)', track: 'frac', status: 'planned', accent: 'lilac' },
  { id: 'mixing', name: 'Mixing Studio', creation: 'Balance recipes and flows (ratios and rates)', track: 'ratio', status: 'planned', accent: 'apricot' },
  { id: 'market', name: 'Market Square', creation: 'Reason about quantities and changes (percentages)', track: 'pct', status: 'planned', accent: 'sage' },
  { id: 'balance', name: 'Balance Hall', creation: 'Transform balanced expressions (algebra)', status: 'planned', accent: 'sky' },
  { id: 'garden', name: 'Shape Garden and Observatory', creation: 'Geometry and data', status: 'planned', accent: 'lilac' },
];

export const DISTRICT_BY_ID: Record<string, District> = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const districtForTrack = (track: TrackId) => DISTRICTS.find((d) => d.track === track);

/** How an object is earned. */
export type EarnRule =
  | { kind: 'mission'; missionId: string }
  | { kind: 'missions'; count: number }
  | { kind: 'weekly' }
  | { kind: 'coins'; cost: number };

export interface WorkshopItem {
  id: string;
  name: string;
  /** One line shown in the collection and when it's revealed. */
  blurb: string;
  earn: EarnRule;
  /** Where it appears in the scene. */
  spot: 'bench' | 'shelf' | 'wall' | 'window' | 'floor';
}

export const ITEMS: WorkshopItem[] = [
  // Gatehouse chapter: one object per mission.
  { id: 'bench-lamp', name: 'Bench lamp', blurb: 'Your first light.', earn: { kind: 'mission', missionId: 'gate-1' }, spot: 'bench' },
  { id: 'brass-gear', name: 'Turning gear', blurb: 'A small mechanism begins turning.', earn: { kind: 'mission', missionId: 'forge-9' }, spot: 'wall' },
  { id: 'discovery-card', name: 'Discovery card: 3 is not 9', blurb: 'Every multiple of 9 is a multiple of 3, not the other way round.', earn: { kind: 'mission', missionId: 'breaker-3-9' }, spot: 'shelf' },
  { id: 'gate-token', name: 'Gatehouse token', blurb: 'You checked the idea on your own.', earn: { kind: 'mission', missionId: 'check-gate' }, spot: 'shelf' },
  { id: 'telescope', name: 'Small telescope', blurb: 'You used the idea somewhere new.', earn: { kind: 'mission', missionId: 'transfer-gate' }, spot: 'window' },
  { id: 'recall-bell', name: 'Recall bell', blurb: 'You remembered it a day later.', earn: { kind: 'mission', missionId: 'recall-gate' }, spot: 'bench' },
  // Factor Foundry and Clockwork Harbor.
  { id: 'prime-jar', name: 'Jar of prime tiles', blurb: 'Every number breaks into the same primes.', earn: { kind: 'mission', missionId: 'factory-1' }, spot: 'shelf' },
  { id: 'foundry-token', name: 'Foundry token', blurb: 'You checked factors on your own.', earn: { kind: 'mission', missionId: 'check-foundry' }, spot: 'shelf' },
  { id: 'harbor-clock', name: 'Harbor clock', blurb: 'Complete loops change nothing.', earn: { kind: 'mission', missionId: 'rails-1' }, spot: 'wall' },
  { id: 'harbor-token', name: 'Harbor token', blurb: 'You checked remainders on your own.', earn: { kind: 'mission', missionId: 'check-harbor' }, spot: 'shelf' },
  // Milestones.
  { id: 'bookshelf', name: 'Bookshelf', blurb: 'Complete two different learning missions to finish this shelf.', earn: { kind: 'missions', count: 2 }, spot: 'wall' },
  { id: 'weekly-ribbon', name: 'Weekly ribbon', blurb: 'Reach your weekly practice goal.', earn: { kind: 'weekly' }, spot: 'wall' },
  // Bought with Workshop Coins.
  { id: 'pencil-mug', name: 'Pencil mug', blurb: 'For the sharpest pencils.', earn: { kind: 'coins', cost: 10 }, spot: 'bench' },
  { id: 'pennant', name: 'Workshop pennant', blurb: 'Your workshop, your colors.', earn: { kind: 'coins', cost: 12 }, spot: 'wall' },
  { id: 'fern', name: 'Potted fern', blurb: 'Something green by the window.', earn: { kind: 'coins', cost: 15 }, spot: 'floor' },
  { id: 'rug', name: 'Woven rug', blurb: 'Warm underfoot.', earn: { kind: 'coins', cost: 25 }, spot: 'floor' },
  { id: 'curtains', name: 'Window curtains', blurb: 'Soft light for long sessions.', earn: { kind: 'coins', cost: 30 }, spot: 'window' },
  { id: 'globe', name: 'Desk globe', blurb: 'More of the world to map.', earn: { kind: 'coins', cost: 35 }, spot: 'bench' },
];

export const ITEM_BY_ID: Record<string, WorkshopItem> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const itemForMission = (missionId: string) => ITEMS.find((i) => i.earn.kind === 'mission' && i.earn.missionId === missionId);

/** How the earn rule reads to a learner. */
export function earnText(item: WorkshopItem): string {
  switch (item.earn.kind) {
    case 'mission':
      return 'Earned by finishing a mission.';
    case 'missions':
      return `Finish ${item.earn.count} different learning missions.`;
    case 'weekly':
      return 'Reach your weekly practice goal.';
    case 'coins':
      return `${item.earn.cost} Workshop Coins.`;
  }
}
