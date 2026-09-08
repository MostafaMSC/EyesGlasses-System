/**
 * One Euro Filter — adaptive low-pass filter for noisy real-time signals.
 *
 * A fixed EMA forces a bad tradeoff: smooth enough to kill jitter means
 * visibly laggy when the head moves fast. This filter adapts its cutoff to
 * the signal's speed — heavy smoothing while nearly still (removes tracking
 * jitter), light smoothing while moving fast (removes lag).
 *
 * Reference: Casiez, Roussel & Vogel, "1€ Filter" (CHI 2012).
 */

class LowPassFilter {
  private hatXPrev: number | null = null;

  reset() {
    this.hatXPrev = null;
  }

  filter(x: number, alpha: number): number {
    if (this.hatXPrev === null) {
      this.hatXPrev = x;
      return x;
    }
    const hatX = alpha * x + (1 - alpha) * this.hatXPrev;
    this.hatXPrev = hatX;
    return hatX;
  }
}

function smoothingFactor(dt: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

export interface OneEuroOptions {
  /** Lower = smoother when still (more jitter removed). */
  minCutoff?: number;
  /** Higher = more responsive when moving fast (less lag). */
  beta?: number;
  /** Cutoff for the derivative used to measure speed. */
  dCutoff?: number;
}

export class OneEuroFilter {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;
  private lastValue: number | null = null;

  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor({ minCutoff = 1.2, beta = 0.05, dCutoff = 1 }: OneEuroOptions = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
    this.lastValue = null;
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTime === null || this.lastValue === null) {
      this.lastTime = timestampMs;
      this.lastValue = value;
      return this.xFilter.filter(value, 1);
    }

    // Guard against zero/absurd frame deltas (tab throttling, first frames).
    const dt = Math.min(Math.max((timestampMs - this.lastTime) / 1000, 1 / 240), 1 / 5);
    this.lastTime = timestampMs;

    const dx = (value - this.lastValue) / dt;
    this.lastValue = value;

    const edx = this.dxFilter.filter(dx, smoothingFactor(dt, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(value, smoothingFactor(dt, cutoff));
  }
}

/** Applies an independent One Euro filter to each named channel of an object. */
export class ChannelSmoother<K extends string> {
  private filters: Record<string, OneEuroFilter> = {};

  constructor(private options: Partial<Record<K, OneEuroOptions>>, private fallback: OneEuroOptions = {}) {}

  reset() {
    for (const key of Object.keys(this.filters)) this.filters[key].reset();
  }

  smooth(channel: K, value: number, timestampMs: number): number {
    if (!this.filters[channel]) {
      this.filters[channel] = new OneEuroFilter(this.options[channel] ?? this.fallback);
    }
    return this.filters[channel].filter(value, timestampMs);
  }
}
