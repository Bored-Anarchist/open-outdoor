import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForegroundTask, boundedDisplayPoints } from '../src/foreground-task';
import { AnnouncementGate, accessibleAppearance } from '../src/accessibility';

afterEach(() => vi.useRealTimers());
describe('WP-502 native accessibility policy', () => {
  it('honors increased contrast even with an appearance override', () => {
    expect(accessibleAppearance('dark', 'light', true)).toBe('high-contrast');
    expect(accessibleAppearance('dark', null, false)).toBe('dark');
    expect(accessibleAppearance('unspecified', null, false)).toBe('light');
  });
  it('announces changes once and resets when VoiceOver is re-enabled', () => {
    const gate = new AnnouncementGate();
    expect(gate.next('Recording paused', true)).toBe('Recording paused');
    expect(gate.next('Recording paused', true)).toBeNull();
    expect(gate.next('Recording resumed', true)).toBe('Recording resumed');
    expect(gate.next('Recording resumed', false)).toBeNull();
    expect(gate.next('Recording resumed', true)).toBe('Recording resumed');
  });
});
describe('WP-503 foreground scheduling', () => {
  it('does not schedule background work, overlap slow operations, or restart after disposal', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const task = new ForegroundTask({ run, onError: vi.fn(), intervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).not.toHaveBeenCalled();
    task.setEligible(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
    task.setEligible(false);
    complete();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
    task.setEligible(true);
    expect(run).toHaveBeenCalledTimes(2);
    task.dispose();
    complete();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('recovers from failures and cancels timers on background transition', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValueOnce(new Error('synthetic')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const task = new ForegroundTask({ run, onError, intervalMs: 5000 });
    task.setEligible(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    task.setEligible(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(2);
    task.dispose();
  });
  it('bounds display allocation and preserves endpoints without modifying durable input', () => {
    const points = Object.freeze(Array.from({ length: 100000 }, (_, i) => i));
    const result = boundedDisplayPoints(points);
    expect(result.length).toBe(2048);
    expect(result[0]).toBe(0);
    expect(result.at(-1)).toBe(99999);
    expect(points.length).toBe(100000);
    expect(new Set(result).size).toBe(result.length);
    expect(() => boundedDisplayPoints(points, 1)).toThrow();
  });
});
