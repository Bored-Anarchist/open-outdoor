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
  it('pauses native sensors when the initial durable snapshot fails', async () => {
    const { recorder, tracker, commit } = fixture();
    const pause = vi.spyOn(tracker, 'pause');
    commit.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(recorder.start('balanced')).rejects.toThrow('disk unavailable');
    expect(pause).toHaveBeenCalledOnce();
    expect(recorder.stateMachine.state.kind).toBe('paused');
    expect((await tracker.recover())?.state).toBe('paused');
    await recorder.recover();
    await expect(recorder.finish()).resolves.toMatchObject({ activity: { lifecycle: 'finished' } });
  });
  it('does not call native start while another recording is active', async () => {
    const { recorder, tracker } = fixture();
    await recorder.start('balanced');
    const start = vi.spyOn(tracker, 'start');
    await expect(recorder.start('balanced')).rejects.toThrow(/current recording/);
    expect(start).not.toHaveBeenCalled();
  });
  it('pauses sensors again when saving a resumed recording fails', async () => {
    const { recorder, tracker, commit } = fixture();
    await recorder.start('balanced');
    await recorder.pause();
    commit.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(recorder.resume()).rejects.toThrow('disk unavailable');
    expect((await tracker.recover())?.state).toBe('paused');
    expect(recorder.stateMachine.state.kind).toBe('paused');
    await recorder.resume();
    expect(recorder.stateMachine.state.kind).toBe('recording');
  });
  it('stops sensors before a failed drain and retries without a second native stop', async () => {
    const { recorder, tracker, commit, repository } = fixture();
    await recorder.start('balanced');
    tracker.inject(batch);
    const stop = vi.spyOn(tracker, 'finish');
    commit.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(recorder.finish()).rejects.toThrow('disk unavailable');
    expect(stop).toHaveBeenCalledOnce();
    expect(recorder.stateMachine.state.kind).toBe('paused');
    await recorder.finish();
    expect(stop).toHaveBeenCalledOnce();
    expect(repository.exportSnapshot().activities[0]?.samples).toHaveLength(1);
    expect(repository.exportSnapshot().activities[0]?.samples[0]?.paused).toBe(false);
  });
  it('retries a failed final snapshot without rebuilding a duplicate derived revision', async () => {
    const { recorder, tracker, commit, repository } = fixture();
    await recorder.start('balanced');
    const stop = vi.spyOn(tracker, 'finish');
    commit.mockRejectedValueOnce(new Error('final write unavailable'));
    await expect(recorder.finish()).rejects.toThrow('final write unavailable');
    await expect(recorder.start('balanced')).rejects.toThrow(/current recording/);
    const result = await recorder.finish();
    expect(result.activity.lifecycle).toBe('finished');
    expect(stop).toHaveBeenCalledOnce();
    expect(repository.exportSnapshot().revisions).toHaveLength(1);
  });
  it('retries failed native finalization while keeping the committed summary', async () => {
    const { recorder, tracker, repository } = fixture();
    await recorder.start('balanced');
    const finalize = vi
      .spyOn(tracker, 'finalize')
      .mockRejectedValueOnce(new Error('bridge unavailable'));
    await expect(recorder.finish()).rejects.toThrow('bridge unavailable');
    await expect(recorder.finish()).resolves.toMatchObject({ activity: { lifecycle: 'finished' } });
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(repository.exportSnapshot().revisions).toHaveLength(1);
  });
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
