/**
 * Purchase provider. The app talks to this interface only, so swapping the
 * test provider for RevenueCat in Phase 4 touches one file. The RevenueCat
 * adapter, its store setup and webhook are described in docs/MONETIZATION.md.
 */
export interface PurchaseResult {
  ok: boolean;
  productId?: string;
  cancelled?: boolean;
  error?: string;
}

export interface PurchaseProvider {
  name: 'test' | 'revenuecat';
  /** True when no money moves. The paywall says so plainly. */
  isTest: boolean;
  purchase(productId: string): Promise<PurchaseResult>;
  /** Re-reads what the store says the learner owns. */
  restore(): Promise<{ ok: boolean; productIds: string[] }>;
}

/**
 * Test provider: completes purchases instantly with no charge, so every
 * entitlement path can be exercised before store products exist.
 */
export function createTestProvider(owned: () => string[]): PurchaseProvider {
  return {
    name: 'test',
    isTest: true,
    purchase: async (productId) => {
      await new Promise((r) => setTimeout(r, 350));
      return { ok: true, productId };
    },
    restore: async () => ({ ok: true, productIds: owned() }),
  };
}
