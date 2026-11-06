import type { StyleProp, TextStyle } from 'react-native';
import { Micro } from './kit';

/**
 * The exam names are other organizations' trademarks. Shown on every screen
 * that names an exam (College Board asks for it on each page, not only a
 * legal page). Referential use only: no logos, no implied endorsement.
 */
export const EXAM_MARKS =
  'SAT is a trademark registered by the College Board. ACT is a registered trademark of ACT Education Corp. GMAT is a trademark of GMAC. GRE is a registered trademark of ETS. None of them is affiliated with Rulesmith or endorses it.';

export function ExamMarks({ style }: { style?: StyleProp<TextStyle> }) {
  return <Micro style={style}>{EXAM_MARKS}</Micro>;
}
