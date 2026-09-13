import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrivateRepository } from '@open-outdoor/storage';
import { FixtureTrackerAdapter, type TrackingBatch } from '@open-outdoor/tracking';
import { RecorderCoordinator } from '../src/index';
const batch: TrackingBatch = {
  sessionId: 'fixture-session',
  mode: 'balanced',
  firstSequence: 1,
  createdAt: '2026-09-10T10:00:01.000Z',
  observations: [
    {
      sequence: 1,
      coordinate: [0, 0],
      recordedAt: '2026-09-10T10:00:01.000Z',
      horizontalAccuracyM: 5,
    },
  ],
};
function fixture() {
  const tracker = new FixtureTrackerAdapter();
  const repository = new InMemoryPrivateRepository();
  const commit = vi.fn().mockResolvedValue(undefined);
  return {
    tracker,
    repository,
    commit,
    recorder: new RecorderCoordinator(tracker, repository, { commit }),
  };
}
describe('WP-503 recorder I/O hardening', () => {
  it('performs no snapshot writes for 720 empty refreshes', async () => {
    const { recorder, commit } = fixture();
    await recorder.start('balanced');
    const before = commit.mock.calls.length;
    for (let i = 0; i < 720; i++) await recorder.synchronize();
    expect(commit).toHaveBeenCalledTimes(before);
  });
  it('retries failed persistence before acknowledging and does not duplicate observations', async () => {
    const { recorder, tracker, commit, repository } = fixture();
    await recorder.start('balanced');
    tracker.inject(batch);
    const ack = vi.spyOn(tracker, 'acknowledge');
    commit.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(recorder.synchronize()).rejects.toThrow('disk unavailable');
    expect(ack).not.toHaveBeenCalled();
    await recorder.synchronize();
    expect(ack).toHaveBeenCalledWith(1);
    expect(repository.exportSnapshot().activities[0]?.samples).toHaveLength(1);
  });
  it('retries acknowledgement without another snapshot write', async () => {
    const { recorder, tracker, commit } = fixture();
    await recorder.start('balanced');
    tracker.inject(batch);
    const ack = vi
      .spyOn(tracker, 'acknowledge')
      .mockRejectedValueOnce(new Error('bridge unavailable'));
    await expect(recorder.synchronize()).rejects.toThrow('bridge unavailable');
    const count = commit.mock.calls.length;
    await recorder.synchronize();
    expect(commit).toHaveBeenCalledTimes(count);
    expect(ack).toHaveBeenCalledTimes(2);
  });
  it('serializes refresh and pause across a slow persistence operation', async () => {
    const { recorder, tracker, commit } = fixture();
    await recorder.start('balanced');
    tracker.inject(batch);
    let release!: () => void;
    commit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const sync = recorder.synchronize();
    await vi.waitFor(() => expect(release).toBeDefined());
    const pause = vi.spyOn(tracker, 'pause');
    const paused = recorder.pause();
    await Promise.resolve();
    expect(pause).not.toHaveBeenCalled();
    release();
    await Promise.all([sync, paused]);
    expect(recorder.stateMachine.state.kind).toBe('paused');
  });
  it('persists recovery lifecycle even when there are no new observations', async () => {
    const { recorder, commit } = fixture();
    await recorder.start('balanced');
    const count = commit.mock.calls.length;
    await recorder.recover();
    expect(commit.mock.calls.length).toBeGreaterThan(count);
  });
});
