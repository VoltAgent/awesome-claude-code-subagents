export interface WitnessEntry {
  epoch: number;
  action?: string;
  signature?: string;
  timestamp?: string;
  hash?: string;
  previous_hash?: string;
}

export interface WitnessGap {
  deviceId: string;
  fromEpoch: number;
  toEpoch: number;
  missingCount: number;
}

export interface WitnessVerificationResult {
  deviceId: string;
  chainLength: number;
  verified: boolean;
  gaps: WitnessGap[];
  headEpoch: number;
  headHash: string;
  integrityScore: number;
}

export interface WitnessVerificationDeps {
  getWitnessChain: (deviceId: string) => Promise<{
    length?: number;
    head?: string;
    entries?: Array<{ epoch: number; action?: string; signature?: string; timestamp?: string; hash?: string; previous_hash?: string }>;
  }>;
}

export class WitnessVerificationService {
  constructor(private readonly deps: WitnessVerificationDeps) {}

  async verifyChain(deviceId: string): Promise<WitnessVerificationResult> {
    const chain = await this.deps.getWitnessChain(deviceId);
    const entries = chain.entries ?? [];
    const chainLength = chain.length ?? entries.length ?? 0;

    if (entries.length === 0) {
      return {
        deviceId,
        chainLength,
        verified: true,
        gaps: [],
        headEpoch: 0,
        headHash: chain.head ?? '',
        integrityScore: chainLength > 0 ? 0.5 : 1.0,
      };
    }

    const sorted = [...entries].sort((a, b) => a.epoch - b.epoch);
    const gaps = this.detectGaps(deviceId, sorted);
    const hashValid = this.verifyHashChain(sorted);

    const gapRatio = gaps.length > 0
      ? gaps.reduce((sum, g) => sum + g.missingCount, 0) / chainLength
      : 0;

    const integrityScore = Math.max(0, 1 - gapRatio) * (hashValid ? 1 : 0.5);

    return {
      deviceId,
      chainLength,
      verified: gaps.length === 0 && hashValid,
      gaps,
      headEpoch: sorted[sorted.length - 1].epoch,
      headHash: chain.head ?? sorted[sorted.length - 1].hash ?? '',
      integrityScore,
    };
  }

  private detectGaps(
    deviceId: string,
    sorted: Array<{ epoch: number }>,
  ): WitnessGap[] {
    const gaps: WitnessGap[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const expected = sorted[i - 1].epoch + 1;
      const actual = sorted[i].epoch;
      if (actual > expected) {
        gaps.push({
          deviceId,
          fromEpoch: sorted[i - 1].epoch,
          toEpoch: actual,
          missingCount: actual - expected,
        });
      }
    }

    return gaps;
  }

  private verifyHashChain(
    sorted: Array<{ hash?: string; previous_hash?: string }>,
  ): boolean {
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].previous_hash && sorted[i - 1].hash && sorted[i].previous_hash !== sorted[i - 1].hash) {
        return false;
      }
    }
    return true;
  }
}
