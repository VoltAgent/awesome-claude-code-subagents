import type { DeviceTrustLevel } from '../domain/entities/index.js';
import type {
  TrustHistoryEntry,
  TrustHistoryRepository,
} from '../domain/repositories/index.js';

export class InMemoryTrustHistoryRepository
  implements TrustHistoryRepository
{
  private readonly entries: TrustHistoryEntry[] = [];

  async append(entry: TrustHistoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByDevice(
    deviceId: string,
    limit?: number,
  ): Promise<TrustHistoryEntry[]> {
    const matches = this.entries.filter((e) => e.deviceId === deviceId);
    return limit !== undefined ? matches.slice(-limit) : matches;
  }

  async findByLevel(
    level: DeviceTrustLevel,
  ): Promise<TrustHistoryEntry[]> {
    return this.entries.filter((e) => e.newLevel === level);
  }

  async deleteByDevice(deviceId: string): Promise<number> {
    let removed = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].deviceId === deviceId) {
        this.entries.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  async count(): Promise<number> {
    return this.entries.length;
  }
}
