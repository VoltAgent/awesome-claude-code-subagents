/**
 * IoT-adapted trust levels for Cognitum Seed devices.
 * Mirrors Ruflo agent trust but adds hardware-specific stages.
 */
export enum DeviceTrustLevel {
  /** Seen on the network but not paired. */
  UNKNOWN = 0,
  /** Paired, identity verified via Ed25519. */
  REGISTERED = 1,
  /** Firmware verified, policies applied, security zone assigned. */
  PROVISIONED = 2,
  /** Extended uptime, clean witness chain, anomaly-free history. */
  CERTIFIED = 3,
  /** Fleet-level attestation across multiple devices. */
  FLEET_TRUSTED = 4,
}

const LABELS: Record<DeviceTrustLevel, string> = {
  [DeviceTrustLevel.UNKNOWN]: 'unknown',
  [DeviceTrustLevel.REGISTERED]: 'registered',
  [DeviceTrustLevel.PROVISIONED]: 'provisioned',
  [DeviceTrustLevel.CERTIFIED]: 'certified',
  [DeviceTrustLevel.FLEET_TRUSTED]: 'fleet-trusted',
};

export function getDeviceTrustLabel(level: DeviceTrustLevel): string {
  return LABELS[level] ?? 'unknown';
}
