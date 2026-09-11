import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { createGuidedSession } from '../src/production-guided';
const native = vi.hoisted(() => ({
  environment: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  share: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({
  nativeSpikes: {
    phase3AcceptanceEnvironment: native.environment,
    loadPhase5AcceptanceState: native.load,
    savePhase5AcceptanceState: native.save,
    sharePhase5AcceptanceReport: native.share,
  },
}));
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  Alert: { alert: vi.fn() },
}));
vi.mock('../../../apps/mobile/accessibility', () => ({ ProductText: 'text' }));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductCard: ({ children }: any) => React.createElement('card', {}, children),
  ProductButton: (props: any) => React.createElement('button', props),
}));
import { Phase5AcceptanceRunner } from '../../../apps/mobile/Phase5AcceptanceRunner';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const env = {
  sourceCommit: 'a'.repeat(40),
  binarySha256: 'b'.repeat(64),
  deviceModelIdentifier: 'iPhone14,7',
  systemVersion: '26.6',
  residentMemoryMiB: 100,
  encryptedBackupRoundTripPassed: true,
  wrongSecretRejected: true,
};
let tree: ReturnType<typeof create>;
const button = (label: string) =>
  tree.root.findAllByType('button' as any).find((b) => b.props.label === label)!;
async function begin(saved: string | null = null) {
  native.environment.mockResolvedValue(env);
  native.load.mockResolvedValue(saved);
  native.save.mockImplementation(async (v: string) => v);
  await act(async () => {
    tree = create(React.createElement(Phase5AcceptanceRunner, { enabled: true }));
  });
  await act(async () => {
    await button('Begin or resume Phase 5 guide').props.onPress();
  });
}
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.resetAllMocks();
});
it('persists observations before showing advancement and exports only explicit shares', async () => {
  await begin();
  expect(native.share).not.toHaveBeenCalled();
  await act(async () => {
    await button('Observed flow succeeded').props.onPress();
  });
  const saved = JSON.parse(native.save.mock.calls.at(-1)![0]);
  expect(saved.steps[0].status).toBe('observed-pass');
  expect(saved.steps[1].status).toBe('pending');
  await act(async () => {
    await button('Share redacted Phase 5 observations').props.onPress();
  });
  expect(JSON.parse(native.share.mock.calls[0][0])).toEqual(saved);
});
it('does not advance after persistence failure', async () => {
  await begin();
  native.save.mockRejectedValueOnce(new Error('locked'));
  await act(async () => {
    await button('Observed flow succeeded').props.onPress();
  });
  await act(async () => {
    await button('Share redacted Phase 5 observations').props.onPress();
  });
  expect(JSON.parse(native.share.mock.calls[0][0]).steps[0].status).toBe('pending');
});
it('retains a stale session for export but disables observations', async () => {
  const stale = createGuidedSession({ ...env, binarySha256: 'c'.repeat(64) });
  await begin(JSON.stringify(stale));
  expect(native.save).not.toHaveBeenCalled();
  expect(button('Observed flow succeeded').props.disabled).toBe(true);
  await act(async () => {
    await button('Share redacted Phase 5 observations').props.onPress();
  });
  expect(JSON.parse(native.share.mock.calls[0][0]).identity.binarySha256).toBe('c'.repeat(64));
});
