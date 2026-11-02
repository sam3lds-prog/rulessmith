// Prints one item per template (level 9; ALL_LEVELS=1 for level 2 too) and the slowest checks.
// For human content review: npm run content:sample
import { it } from 'vitest';
import { checkItem, generateItem, TEMPLATES } from '../content';
it('sample', () => {
  const slow: [string, number][] = [];
  for (const t of TEMPLATES) {
    for (const level of [2, 9]) {
      const item = generateItem(t.id, Math.max(level, t.minLevel ?? 1), 4242 + level, { allowDisabled: true });
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) checkItem(item, item.key);
      const ms = (performance.now() - t0) / 3;
      slow.push([item.id, ms]);
      if (level === 9 || process.env.ALL_LEVELS) {
        const p: any = item.payload;
        const extra = p.kind === 'sort' ? p.numbers.join(' ') : p.kind === 'choice' ? p.options.map((o: any) => o.label).join(' | ') : p.kind === 'refute' ? p.claimText + ' :: ' + JSON.stringify(p.candidates) : p.kind === 'construct' ? p.fixed.map((d: any) => d ?? '_').join('') + ' ' + p.mode : '';
        console.log(`\n[${item.id}] ${item.prompt}\n  ${extra}\n  hints: ${item.hints.join(' / ')}\n  expl: ${item.explanation}`);
      }
    }
  }
  slow.sort((a, b) => b[1] - a[1]);
  console.log('\nSLOWEST CHECKS (ms):', slow.slice(0, 8).map(([id, ms]) => `${id} ${ms.toFixed(1)}`).join('\n'));
});
