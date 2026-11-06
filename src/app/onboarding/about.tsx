import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { EXAMS, type ExamId } from '../../content/curriculum';
import { addDays, dayKey } from '../../engine/time';
import type { AgeBand, Profile, Role } from '../../engine/types';
import { policyFor } from '../../policy/age';
import { useApp } from '../../state/store';
import { Body, Button, Chip, Gap, Micro, OptionRow, Row, Screen, Small, Title } from '../../ui/kit';
import { color, font, radius, space } from '../../ui/theme';
import { ExamMarks } from '../../ui/ExamMarks';

const ROLES: { id: Role; label: string }[] = [
  { id: 'grad-applicant', label: 'Applying to grad school' },
  { id: 'working-adult', label: 'Working adult' },
  { id: 'college', label: 'College student' },
  { id: 'high-school', label: 'High-school student' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'parent', label: 'Parent setting this up for a learner' },
];

const DATES = [
  { label: 'In about 4 weeks', weeks: 4 },
  { label: 'In about 8 weeks', weeks: 8 },
  { label: 'In about 12 weeks', weeks: 12 },
  { label: 'In about 6 months', weeks: 26 },
];

const LEVELS: { r: 1 | 2 | 3 | 4 | 5; label: string; detail: string }[] = [
  { r: 1, label: 'Rusty', detail: 'It has been years since I did this kind of math' },
  { r: 2, label: 'Getting there', detail: 'I know the basics but make slips' },
  { r: 3, label: 'Solid', detail: 'Most textbook problems are fine' },
  { r: 4, label: 'Strong', detail: 'I want the harder problems' },
  { r: 5, label: 'Very strong', detail: 'I am polishing for a top score' },
];

type Step = 'age' | 'role' | 'exams' | 'date' | 'goal' | 'level' | 'time' | 'style';

export default function About() {
  const setProfile = useApp((s) => s.setProfile);
  const existing = useApp((s) => s.profile);
  const [ageBand, setAgeBand] = useState<AgeBand | undefined>(existing?.ageBand);
  const [role, setRole] = useState<Role | undefined>(existing?.role);
  const [exams, setExams] = useState<ExamId[]>(existing?.exams ?? []);
  const [noExam, setNoExam] = useState(existing ? existing.exams.length === 0 : false);
  const [weeksOut, setWeeksOut] = useState<number | null | undefined>(undefined);
  const [goalKind, setGoalKind] = useState<'score' | 'skill'>(existing?.goal.kind ?? 'score');
  const [goalText, setGoalText] = useState(existing ? (existing.goal.kind === 'score' ? existing.goal.target : existing.goal.text) : '');
  const [levelKind, setLevelKind] = useState<'self' | 'score'>('self');
  const [selfRating, setSelfRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [lastScore, setLastScore] = useState('');
  const [minutes, setMinutes] = useState(existing?.minutesPerDay ?? 20);
  const [days, setDays] = useState(existing?.daysPerWeek ?? 4);
  const [timed, setTimed] = useState(existing?.style.timed ?? false);

  // Only questions whose answers the app uses. Reminders and other subjects come back when they exist.
  const steps: Step[] = ['age', 'role', 'exams', ...(noExam ? [] : (['date'] as Step[])), 'goal', 'level', 'time', 'style'];
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const minor = ageBand && !policyFor(ageBand).canPractice;

  const canContinue = (() => {
    switch (step) {
      case 'age':
        return !!ageBand && !minor;
      case 'role':
        return !!role;
      case 'exams':
        return noExam || exams.length > 0;
      case 'date':
        return weeksOut !== undefined;
      default:
        return true;
    }
  })();

  const finish = () => {
    const profile: Profile = {
      ageBand: ageBand!,
      role: role!,
      exams: noExam ? [] : exams,
      testDate: !noExam && weeksOut ? dayKey(addDays(Date.now(), weeksOut * 7)) : undefined,
      goal: goalKind === 'score' ? { kind: 'score', target: goalText.trim() } : { kind: 'skill', text: goalText.trim() },
      currentLevel: levelKind === 'score' && lastScore.trim() ? { kind: 'score', value: lastScore.trim() } : { kind: 'self', rating: selfRating },
      minutesPerDay: minutes,
      daysPerWeek: days,
      subjects: ['quant'],
      style: { timed },
      createdAt: existing?.createdAt ?? Date.now(),
    };
    setProfile(profile);
    router.replace('/onboarding/placement');
  };

  const next = () => (i >= steps.length - 1 ? finish() : setI(i + 1));
  const back = () => (i === 0 ? router.back() : setI(i - 1));

  const footer = (
    <Row>
      <Button title="Back" kind="secondary" onPress={back} style={{ flex: 1 }} />
      <Button title={i >= steps.length - 1 ? 'Build my plan' : 'Continue'} onPress={next} disabled={!canContinue} style={{ flex: 1.6 }} />
    </Row>
  );

  // A plain function, not a component: a component defined in render would remount
  // (and drop text-input focus) on every keystroke.
  const Q = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
    <View style={{ gap: space.md }}>
      <Micro>
        Question {i + 1} of {steps.length}
      </Micro>
      <Title>{title}</Title>
      {note ? <Small>{note}</Small> : null}
      <Gap h={space.xs} />
      {children}
    </View>
  );

  const body = (() => {
    switch (step) {
      case 'age':
        return (
          Q({ title: "How old are you?", note: "This decides which features we can offer you, such as purchases and ads.", children: (<>
            {(
              [
                ['18plus', '18 or older'],
                ['13to17', '13 to 17'],
                ['under13', 'Under 13'],
              ] as [AgeBand, string][]
            ).map(([id, label]) => (
              <OptionRow key={id} label={label} selected={ageBand === id} onPress={() => setAgeBand(id)} />
            ))}
            {ageBand && policyFor(ageBand).note ? <Body style={styles.note}>{policyFor(ageBand).note}</Body> : null}
          </>) })
        );
      case 'role':
        return (
          Q({ title: "Which describes you best?", children: (<>
            {ROLES.map((r) => (
              <OptionRow key={r.id} label={r.label} selected={role === r.id} onPress={() => setRole(r.id)} />
            ))}
          </>) })
        );
      case 'exams':
        return (
          Q({ title: "Which exam are you preparing for?", note: "Pick any that apply. Your plan orders topics by our own estimate of how much each exam uses them.", children: (<>
            <View style={styles.wrap}>
              {EXAMS.map((e) => (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={!noExam && exams.includes(e.id)}
                  onPress={() => {
                    setNoExam(false);
                    setExams(exams.includes(e.id) ? exams.filter((x) => x !== e.id) : [...exams, e.id]);
                  }}
                />
              ))}
              <Chip
                label="No exam, just the skills"
                selected={noExam}
                onPress={() => {
                  setNoExam(!noExam);
                  setExams([]);
                }}
              />
            </View>
            <ExamMarks style={{ marginTop: space.md }} />
          </>) })
        );
      case 'date':
        return (
          Q({ title: "When is your test?", note: "Your plan paces itself to this date. You can change it later.", children: (<>
            {DATES.map((d) => (
              <OptionRow key={d.weeks} label={d.label} selected={weeksOut === d.weeks} onPress={() => setWeeksOut(d.weeks)} />
            ))}
            <OptionRow label="Not booked yet" detail="You'll get a rolling plan with monthly goals" selected={weeksOut === null} onPress={() => setWeeksOut(null)} />
          </>) })
        );
      case 'goal':
        return (
          Q({ title: "What's your goal?", note: "Optional. A note for you to keep in view. The plan is built from your exam, date and time, and it is foundations practice, not a score prediction.", children: (<>
            <Row>
              <Chip label="A target score" selected={goalKind === 'score'} onPress={() => setGoalKind('score')} />
              <Chip label="A skill to get comfortable with" selected={goalKind === 'skill'} onPress={() => setGoalKind('skill')} />
            </Row>
            <TextInput
              value={goalText}
              onChangeText={setGoalText}
              placeholder={goalKind === 'score' ? 'For example, 705' : 'For example, remainders'}
              placeholderTextColor={color.inkFaint}
              style={styles.input}
              accessibilityLabel={goalKind === 'score' ? 'Target score' : 'Skill goal'}
            />
          </>) })
        );
      case 'level':
        return (
          Q({ title: "How strong is your math right now?", note: "This only sets where the placement check starts.", children: (<>
            <Row>
              <Chip label="Rate myself" selected={levelKind === 'self'} onPress={() => setLevelKind('self')} />
              <Chip label="I have a recent score" selected={levelKind === 'score'} onPress={() => setLevelKind('score')} />
            </Row>
            {levelKind === 'self' ? (
              LEVELS.map((l) => <OptionRow key={l.r} label={l.label} detail={l.detail} selected={selfRating === l.r} onPress={() => setSelfRating(l.r)} />)
            ) : (
              <TextInput
                value={lastScore}
                onChangeText={setLastScore}
                placeholder="Official or practice score"
                placeholderTextColor={color.inkFaint}
                style={styles.input}
                accessibilityLabel="Last score"
              />
            )}
          </>) })
        );
      case 'time':
        return (
          Q({ title: "How much time can you give it?", note: "Short, regular sessions beat long, rare ones.", children: (<>
            <Small>Minutes a day</Small>
            <View style={styles.wrap}>
              {[10, 15, 20, 30, 45].map((m) => (
                <Chip key={m} label={`${m}`} selected={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
            <Gap h={space.sm} />
            <Small>Days a week</Small>
            <View style={styles.wrap}>
              {[3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} label={`${d}`} selected={days === d} onPress={() => setDays(d)} />
              ))}
            </View>
          </>) })
        );
      case 'style':
        return (
          Q({ title: "How do you like to practise?", children: (<>
            <OptionRow label="Untimed first" detail="Understand it, then get fast" selected={!timed} onPress={() => setTimed(false)} />
            <OptionRow label="Timed drills" detail="Show a clock in Challenge runs" selected={timed} onPress={() => setTimed(true)} />
          </>) })
        );
    }
  })();

  return (
    <Screen footer={footer}>
      <Gap h={space.md} />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: color.ruleStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontFamily: font.body,
    fontSize: 17,
    color: color.ink,
    backgroundColor: color.surface,
  },
  note: { backgroundColor: color.goldWash, padding: space.md, borderRadius: radius.sm, fontSize: 16 },
});
