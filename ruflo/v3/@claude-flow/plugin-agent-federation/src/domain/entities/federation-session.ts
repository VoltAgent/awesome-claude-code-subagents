import { TrustLevel } from './trust-level.js';

export interface SessionMetrics {
  messagesSent: number;
  messagesReceived: number;
  piiRedactions: number;
  threatDetections: number;
  hmacFailures: number;
  totalInteractions: number;
}

export interface FederationSessionProps {
  readonly sessionId: string;
  readonly localNodeId: string;
  readonly remoteNodeId: string;
  readonly trustLevel: TrustLevel;
  readonly negotiatedCapabilities: readonly string[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly heartbeatInterval: number;
  readonly sessionToken: string;
  readonly metrics: SessionMetrics;
}

export class FederationSession {
  readonly sessionId: string;
  readonly localNodeId: string;
  readonly remoteNodeId: string;
  readonly negotiatedCapabilities: readonly string[];
  readonly createdAt: Date;
  readonly heartbeatInterval: number;
  readonly sessionToken: string;

  private _trustLevel: TrustLevel;
  private _expiresAt: Date;
  private _lastHeartbeat: Date;
  private _metrics: SessionMetrics;
  private _active: boolean;

  constructor(props: FederationSessionProps) {
    this.sessionId = props.sessionId;
    this.localNodeId = props.localNodeId;
    this.remoteNodeId = props.remoteNodeId;
    this._trustLevel = props.trustLevel;
    this.negotiatedCapabilities = props.negotiatedCapabilities;
    this.createdAt = props.createdAt;
    this._expiresAt = props.expiresAt;
    this.heartbeatInterval = props.heartbeatInterval;
    this.sessionToken = props.sessionToken;
    this._metrics = { ...props.metrics };
    this._lastHeartbeat = new Date();
    this._active = true;
  }

  get trustLevel(): TrustLevel {
    return this._trustLevel;
  }

  get expiresAt(): Date {
    return this._expiresAt;
  }

  get lastHeartbeat(): Date {
    return this._lastHeartbeat;
  }

  get metrics(): Readonly<SessionMetrics> {
    return this._metrics;
  }

  get active(): boolean {
    return this._active;
  }

  isExpired(): boolean {
    return Date.now() >= this._expiresAt.getTime();
  }

  isHeartbeatOverdue(): boolean {
    const overdueThreshold = this.heartbeatInterval * 3;
    return Date.now() - this._lastHeartbeat.getTime() > overdueThreshold;
  }

  recordHeartbeat(): void {
    this._lastHeartbeat = new Date();
  }

  renew(newExpiresAt: Date): void {
    this._expiresAt = newExpiresAt;
    this._lastHeartbeat = new Date();
  }

  updateTrustLevel(level: TrustLevel): void {
    this._trustLevel = level;
  }

  recordMessageSent(): void {
    this._metrics.messagesSent++;
    this._metrics.totalInteractions++;
  }

  recordMessageReceived(): void {
    this._metrics.messagesReceived++;
    this._metrics.totalInteractions++;
  }

  recordPiiRedaction(): void {
    this._metrics.piiRedactions++;
  }

  recordThreatDetection(): void {
    this._metrics.threatDetections++;
  }

  recordHmacFailure(): void {
    this._metrics.hmacFailures++;
  }

  terminate(): void {
    this._active = false;
  }

  toProps(): FederationSessionProps {
    return {
      sessionId: this.sessionId,
      localNodeId: this.localNodeId,
      remoteNodeId: this.remoteNodeId,
      trustLevel: this._trustLevel,
      negotiatedCapabilities: this.negotiatedCapabilities,
      createdAt: this.createdAt,
      expiresAt: this._expiresAt,
      heartbeatInterval: this.heartbeatInterval,
      sessionToken: this.sessionToken,
      metrics: { ...this._metrics },
    };
  }

  static createMetrics(): SessionMetrics {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      piiRedactions: 0,
      threatDetections: 0,
      hmacFailures: 0,
      totalInteractions: 0,
    };
  }
}
