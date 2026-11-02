/**
 * Tokens are earned, never sold. They buy bonus runs and cosmetics, never hints
 * or explanations.
 */
export const TOKEN_REWARDS = {
  sessionComplete: 5,
  dailyPuzzle: 3,
  rewardedAd: 5,
} as const;

export const TOKEN_COSTS = {
  bonusRun: 10,
} as const;

export interface TokenLedgerEntry {
  delta: number;
  reason: keyof typeof TOKEN_REWARDS | keyof typeof TOKEN_COSTS;
  at: number;
}

export function canAfford(balance: number, cost: number) {
  return balance >= cost;
}
