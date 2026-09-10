export interface ScheduledTaskOptions {
  readonly run: () => Promise<void>;
  readonly onError: (error: unknown) => void;
  readonly intervalMs: number;
}
/** At most one operation in flight. The caller owns foreground/lifecycle eligibility. */
export class ForegroundTask {
  private eligible = false;
  private running = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly options: ScheduledTaskOptions;
  constructor(options: ScheduledTaskOptions) {
    this.options = options;
    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1)
      throw new RangeError('Invalid refresh interval');
  }
  setEligible(value: boolean): void {
    if (this.disposed || value === this.eligible) return;
    this.eligible = value;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (value) void this.tick();
  }
  private async tick(): Promise<void> {
    if (!this.eligible || this.running || this.disposed) return;
    this.running = true;
    try {
      await this.options.run();
    } catch (error) {
      if (!this.disposed) this.options.onError(error);
    } finally {
      this.running = false;
      if (this.eligible && !this.disposed)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.tick();
        }, this.options.intervalMs);
    }
  }
  dispose(): void {
    this.disposed = true;
    this.eligible = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/** Display-only simplification; immutable durable observations are never changed. */
export function boundedDisplayPoints<T>(points: readonly T[], maximum = 2048): readonly T[] {
  if (!Number.isInteger(maximum) || maximum < 2)
    throw new RangeError('At least two display points required');
  if (points.length <= maximum) return points;
  return Array.from(
    { length: maximum },
    (_, index) => points[Math.floor((index * (points.length - 1)) / (maximum - 1))]!,
  );
}
