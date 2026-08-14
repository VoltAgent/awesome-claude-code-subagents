export type FederationAuditEventType =
  | 'peer_discovered' | 'peer_manifest_published'
  | 'handshake_initiated' | 'handshake_completed'
  | 'handshake_failed' | 'handshake_rejected'
  | 'session_created' | 'session_renewed'
  | 'session_expired' | 'session_terminated'
  | 'message_sent' | 'message_received'
  | 'message_rejected' | 'message_timeout'
  | 'pii_detected' | 'pii_stripped' | 'pii_blocked'
  | 'threat_detected' | 'threat_blocked' | 'threat_learned'
  | 'claim_checked' | 'claim_denied' | 'trust_level_changed'
  | 'consensus_proposed' | 'consensus_voted'
  | 'consensus_reached' | 'consensus_failed';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

export type AuditCategory = 'discovery' | 'handshake' | 'message' | 'pii' | 'security' | 'consensus';

export type ComplianceMode = 'hipaa' | 'soc2' | 'gdpr' | 'none';

export interface FederationAuditEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly nodeId: string;
  readonly sessionId?: string;

  readonly eventType: FederationAuditEventType;
  readonly severity: AuditSeverity;
  readonly category: AuditCategory;

  readonly sourceNodeId?: string;
  readonly targetNodeId?: string;
  readonly agentId?: string;
  readonly trustLevel?: number;

  readonly piiDetected?: boolean;
  readonly piiTypesFound?: string[];
  readonly piiAction?: string;
  readonly threatDetected?: boolean;
  readonly threatTypes?: string[];
  readonly claimsChecked?: string[];
  readonly claimsResult?: 'granted' | 'denied';

  readonly latencyMs?: number;
  readonly messageSizeBytes?: number;

  readonly complianceMode?: ComplianceMode;
  readonly dataResidency?: string;

  readonly metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  readonly eventType?: FederationAuditEventType;
  readonly severity?: AuditSeverity;
  readonly category?: AuditCategory;
  readonly nodeId?: string;
  readonly sessionId?: string;
  readonly since?: Date;
  readonly until?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

export type AuditExportFormat = 'json' | 'csv' | 'ndjson';

export interface AuditServiceDeps {
  generateEventId: () => string;
  getLocalNodeId: () => string;
  persistEvent: (event: FederationAuditEvent) => Promise<void>;
  queryEvents: (query: AuditQuery) => Promise<FederationAuditEvent[]>;
  onAuditEvent?: (event: FederationAuditEvent) => void;
}

export interface AuditServiceConfig {
  readonly complianceMode: ComplianceMode;
  readonly dataResidency?: string;
  readonly retentionDays: number;
  readonly batchSize: number;
}

const DEFAULT_AUDIT_CONFIG: AuditServiceConfig = {
  complianceMode: 'none',
  retentionDays: 90,
  batchSize: 100,
};

const SEVERITY_BY_EVENT_TYPE: Record<FederationAuditEventType, AuditSeverity> = {
  peer_discovered: 'info',
  peer_manifest_published: 'info',
  handshake_initiated: 'info',
  handshake_completed: 'info',
  handshake_failed: 'warn',
  handshake_rejected: 'warn',
  session_created: 'info',
  session_renewed: 'info',
  session_expired: 'info',
  session_terminated: 'info',
  message_sent: 'info',
  message_received: 'info',
  message_rejected: 'warn',
  message_timeout: 'warn',
  pii_detected: 'warn',
  pii_stripped: 'info',
  pii_blocked: 'warn',
  threat_detected: 'error',
  threat_blocked: 'critical',
  threat_learned: 'info',
  claim_checked: 'info',
  claim_denied: 'warn',
  trust_level_changed: 'warn',
  consensus_proposed: 'info',
  consensus_voted: 'info',
  consensus_reached: 'info',
  consensus_failed: 'warn',
};

const CATEGORY_BY_EVENT_TYPE: Record<FederationAuditEventType, AuditCategory> = {
  peer_discovered: 'discovery',
  peer_manifest_published: 'discovery',
  handshake_initiated: 'handshake',
  handshake_completed: 'handshake',
  handshake_failed: 'handshake',
  handshake_rejected: 'handshake',
  session_created: 'handshake',
  session_renewed: 'handshake',
  session_expired: 'handshake',
  session_terminated: 'handshake',
  message_sent: 'message',
  message_received: 'message',
  message_rejected: 'message',
  message_timeout: 'message',
  pii_detected: 'pii',
  pii_stripped: 'pii',
  pii_blocked: 'pii',
  threat_detected: 'security',
  threat_blocked: 'security',
  threat_learned: 'security',
  claim_checked: 'security',
  claim_denied: 'security',
  trust_level_changed: 'security',
  consensus_proposed: 'consensus',
  consensus_voted: 'consensus',
  consensus_reached: 'consensus',
  consensus_failed: 'consensus',
};

export class AuditService {
  private readonly deps: AuditServiceDeps;
  private readonly config: AuditServiceConfig;
  private readonly buffer: FederationAuditEvent[];

  constructor(deps: AuditServiceDeps, config?: Partial<AuditServiceConfig>) {
    this.deps = deps;
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.buffer = [];
  }

  async log(
    eventType: FederationAuditEventType,
    details: Partial<Omit<FederationAuditEvent, 'eventId' | 'timestamp' | 'nodeId' | 'eventType' | 'severity' | 'category' | 'complianceMode'>> = {},
  ): Promise<FederationAuditEvent> {
    const event = this.buildEvent(eventType, details);

    this.buffer.push(event);
    this.deps.onAuditEvent?.(event);

    if (this.buffer.length >= this.config.batchSize || event.severity === 'critical') {
      await this.flush();
    }

    return event;
  }

  async query(query: AuditQuery): Promise<FederationAuditEvent[]> {
    await this.flush();
    return this.deps.queryEvents(query);
  }

  async export(query: AuditQuery, format: AuditExportFormat): Promise<string> {
    const events = await this.query(query);

    switch (format) {
      case 'json':
        return JSON.stringify(events, null, 2);
      case 'ndjson':
        return events.map(e => JSON.stringify(e)).join('\n');
      case 'csv':
        return this.toCsv(events);
    }
  }

  async flush(): Promise<void> {
    const eventsToFlush = this.buffer.splice(0, this.buffer.length);
    for (const event of eventsToFlush) {
      await this.deps.persistEvent(event);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  private buildEvent(
    eventType: FederationAuditEventType,
    details: Partial<Omit<FederationAuditEvent, 'eventId' | 'timestamp' | 'nodeId' | 'eventType' | 'severity' | 'category' | 'complianceMode'>>,
  ): FederationAuditEvent {
    const event: FederationAuditEvent = {
      eventId: this.deps.generateEventId(),
      timestamp: new Date().toISOString(),
      nodeId: this.deps.getLocalNodeId(),
      eventType,
      severity: SEVERITY_BY_EVENT_TYPE[eventType],
      category: CATEGORY_BY_EVENT_TYPE[eventType],
      complianceMode: this.config.complianceMode,
      dataResidency: this.config.dataResidency,
      ...details,
    };

    if (this.config.complianceMode === 'hipaa') {
      return this.applyHipaaCompliance(event);
    }

    return event;
  }

  private applyHipaaCompliance(event: FederationAuditEvent): FederationAuditEvent {
    if (event.piiDetected && event.metadata) {
      const sanitizedMetadata = { ...event.metadata };
      delete sanitizedMetadata['rawContent'];
      delete sanitizedMetadata['originalValue'];
      return { ...event, metadata: sanitizedMetadata };
    }
    return event;
  }

  private toCsv(events: FederationAuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = [
      'eventId', 'timestamp', 'nodeId', 'eventType', 'severity',
      'category', 'sourceNodeId', 'targetNodeId', 'sessionId',
      'trustLevel', 'piiDetected', 'threatDetected', 'latencyMs',
    ];

    const rows = events.map(e =>
      headers.map(h => {
        const val = e[h as keyof FederationAuditEvent];
        if (val === undefined || val === null) return '';
        return String(val);
      }).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }
}
