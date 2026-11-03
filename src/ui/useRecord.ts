import { useMemo } from 'react';
import { useApp } from '../state/store';
import { visibleRecord } from '../state/work';

/** Attempts and skill states as screens should show them: an open check's answers stay hidden until it ends. */
export function useRecord() {
  const attempts = useApp((s) => s.attempts);
  const skills = useApp((s) => s.skills);
  const placementRuns = useApp((s) => s.placementRuns);
  const baseline = useApp((s) => s.baseline);
  const active = useApp((s) => s.active);
  const held = active?.feedback === 'after-set' ? active.results.length : 0;
  return useMemo(
    () => visibleRecord({ attempts, skills, placementRuns, baseline, active }),
    // Only an open after-set session changes the result; ignore other changes to `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempts, skills, placementRuns, baseline, active?.id, held],
  );
}
