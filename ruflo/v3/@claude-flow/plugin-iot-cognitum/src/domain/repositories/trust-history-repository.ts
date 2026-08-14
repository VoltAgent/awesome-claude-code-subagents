import type { DeviceTrustLevel } from '../entities/index.js';
import type { DeviceTrustScore } from '../entities/index.js';

export interface TrustHistoryEntry {
  deviceId: string;
  timestamp: Date;
  oldLevel: DeviceTrustLevel;
  newLevel: DeviceTrustLevel;
  score: DeviceTrustScore;
  /** What caused the change: 'registration', 'pair', 'unpair', 'refresh', 'probe'. */
  trigger: string;
}

export interface TrustHistoryRepository {
  append(entry: TrustHistoryEntry): Promise<void>;
  findByDevice(deviceId: string, limit?: number): Promise<TrustHistoryEntry[]>;
  findByLevel(level: DeviceTrustLevel): Promise<TrustHistoryEntry[]>;
  deleteByDevice(deviceId: string): Promise<number>;
  count(): Promise<number>;
}
