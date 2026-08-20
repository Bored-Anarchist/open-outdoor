import type { TrackPoint } from '@open-outdoor/shared';

export interface TrackingAdapter {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<readonly TrackPoint[]>;
}
