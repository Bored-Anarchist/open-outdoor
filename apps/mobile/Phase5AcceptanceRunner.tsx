import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  createGuidedSession,
  parseGuidedSession,
  observeGuidedStep,
  productionGuidedSteps,
  type GuidedSession,
} from '@open-outdoor/shared';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductCard } from './ProductComponents';
import { nativeSpikes } from './nativeSpikes';
export function Phase5AcceptanceRunner({ enabled }: { enabled: boolean }) {
  const [session, setSession] = useState<GuidedSession | null>(null);
  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState('Begin to run device and protected-backup preflight.');
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      await action();
    } catch {
      if (active.current)
        setMessage(
          'Could not complete. Check device unlock, candidate identity and local diagnostic build. Existing saved evidence was retained.',
        );
    } finally {
      busy.current = false;
      if (active.current) setWorking(false);
    }
  }
  async function begin(reset = false) {
    const environment = await nativeSpikes.phase3AcceptanceEnvironment();
    const fresh = parseGuidedSession(JSON.stringify(createGuidedSession(environment)));
    const saved = reset ? null : await nativeSpikes.loadPhase5AcceptanceState();
    const next = saved === null ? fresh : parseGuidedSession(saved);
    const mismatch = Object.entries(fresh.identity).some(
      ([key, value]) => next.identity[key as keyof typeof next.identity] !== value,
    );
    if (mismatch) {
      if (active.current) {
        setSession(next);
        setStale(true);
        setMessage(
          'Saved observations belong to another candidate. Export them, then explicitly start a new session.',
        );
      }
      return;
    }
    await nativeSpikes.savePhase5AcceptanceState(JSON.stringify(next));
    if (!active.current) return;
    setStale(false);
    setSession(next);
    setIndex(
      Math.max(
        0,
        next.steps.findIndex((s) => s.status === 'pending'),
      ),
    );
    setMessage(
      next.preflight.passed
        ? 'Automatic preflight passed. Observations below still require the actual flows.'
        : 'Preflight did not meet the pinned phone/OS or protected-backup checks. Release acceptance remains blocked.',
    );
  }
  async function observe(status: 'observed-pass' | 'failed' | 'external-required') {
    if (!session || stale) return;
    const next = observeGuidedStep(
      session,
      productionGuidedSteps[index].id,
      status,
      new Date().toISOString(),
    );
    await nativeSpikes.savePhase5AcceptanceState(JSON.stringify(next));
    if (!active.current) return;
    setSession(next);
    setIndex(Math.min(index + 1, productionGuidedSteps.length - 1));
    setMessage(
      'Observation saved. Export to Windows for remaining evidence and acceptance checks.',
    );
  }
  if (!enabled) return null;
  const step = productionGuidedSteps[index];
  return (
    <ProductCard title="Guided production acceptance">
      <Text>
        Phase 5 · iPhone 14 / iOS 26.6. Safe preflight runs automatically when you begin. No sensors
        or destructive tests start automatically.
      </Text>
      <Text accessibilityLiveRegion="polite">{message}</Text>
      <ProductButton
        busy={working}
        label="Begin or resume Phase 5 guide"
        hint="Runs safe native preflight and restores observations for this exact build"
        onPress={() => run(() => begin())}
      />
      {session && (
        <View>
          <Text>
            {session.steps.filter((s) => s.status !== 'pending').length} of {session.steps.length}{' '}
            observations recorded. Production acceptance is not evaluated on this screen.
          </Text>
          <Text accessibilityRole="header">
            {index + 1}. {step.title}
          </Text>
          <Text>{step.instruction}</Text>
          <Text>Recorded status: {session.steps.find((s) => s.id === step.id)?.status}</Text>
          <ProductButton
            busy={working}
            label="Previous test"
            hint="Moves back without changing recorded observations"
            disabled={index === 0}
            onPress={() => setIndex(index - 1)}
          />
          <ProductButton
            busy={working}
            label="Next test without recording"
            hint="Leaves the current observation unchanged"
            disabled={index === productionGuidedSteps.length - 1}
            onPress={() => setIndex(index + 1)}
          />
          <ProductButton
            busy={working}
            label="Observed flow succeeded"
            hint="Records a human observation, not production acceptance"
            disabled={stale || step.kind === 'measurement' || step.kind === 'field'}
            onPress={() => run(() => observe('observed-pass'))}
          />
          <ProductButton
            busy={working}
            disabled={stale}
            label="Observed a failure"
            hint="Records a failed observation for follow-up"
            onPress={() => run(() => observe('failed'))}
          />
          <ProductButton
            busy={working}
            disabled={stale}
            label="Requires external evidence"
            hint="Leaves this test awaiting instrumentation or independent review"
            onPress={() => run(() => observe('external-required'))}
          />
          <ProductButton
            busy={working}
            label="Share redacted Phase 5 observations"
            hint="Opens the iOS share sheet with coordinate-free JSON for the Windows runner"
            onPress={() =>
              run(async () => {
                parseGuidedSession(JSON.stringify(session), session.identity);
                await nativeSpikes.sharePhase5AcceptanceReport(JSON.stringify(session));
              })
            }
          />
        </View>
      )}
      <ProductButton
        busy={working}
        label="Start a new Phase 5 session"
        hint="Asks before replacing only the guided observations"
        destructive
        onPress={() =>
          Alert.alert(
            'Replace guided observations?',
            'Export the current observations first. This replaces only Phase 5 diagnostic state, not recordings or other test reports.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Replace',
                style: 'destructive',
                onPress: () => void run(() => begin(true)),
              },
            ],
          )
        }
      />
    </ProductCard>
  );
}
