import { it } from 'vitest';
import { TEMPLATES } from '../content';
import { SKILLS } from '../content/curriculum';
it('list', () => {
  for (const s of SKILLS) {
    const ts = TEMPLATES.filter(t => t.skillId === s.id);
    console.log(s.id, ts.map(t => `${t.id}${t.transfer ? '[T]' : ''}${t.minLevel ? '(min'+t.minLevel+')' : ''}:${t.board}`).join(', '));
  }
});
