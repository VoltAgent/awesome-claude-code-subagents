import { TrustLevel } from '../entities/trust-level.js';

export type PIIType = 'email' | 'ssn' | 'credit_card' | 'api_key' | 'password'
  | 'name' | 'address' | 'phone' | 'ip_address' | 'jwt'
  | 'aws_key' | 'private_key' | 'database_url' | 'github_token';

export type PIIAction = 'block' | 'redact' | 'hash' | 'pass';

export interface PIIDetection {
  readonly type: PIIType;
  readonly value: string;
  readonly confidence: number;
  readonly offset: number;
  readonly context: string;
}

export interface PIIPolicyConfig {
  defaultAction: PIIAction;
  overrides: Partial<Record<PIIType, {
    action: PIIAction;
    trustLevelOverride?: Partial<Record<TrustLevel, PIIAction>>;
  }>>;
  hashAlgorithm: 'sha256' | 'blake3';
  hashSalt: string;
  redactionPlaceholder: string;
}

export interface PIICalibration {
  type: PIIType;
  falsePositiveRate: number;
  falseNegativeRate: number;
  adjustedThreshold: number;
  totalOverrides: number;
  lastCalibrated: string;
}

export interface PIITransformResult {
  readonly originalText: string;
  readonly transformedText: string;
  readonly detections: readonly PIIDetection[];
  readonly actionsApplied: readonly { type: PIIType; action: PIIAction }[];
  readonly blocked: boolean;
}

export interface PIIConfidenceThresholds {
  autoBlock: number;
  autoRedact: number;
  flagForReview: number;
  ignore: number;
}

const DEFAULT_CONFIDENCE_THRESHOLDS: PIIConfidenceThresholds = {
  autoBlock: 0.95,
  autoRedact: 0.85,
  flagForReview: 0.6,
  ignore: 0.6,
};

const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  api_key: /\b(?:sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})\b/g,
  password: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  name: /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
  address: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Ave|Blvd|Dr|Ln|Rd|Way|Ct)\b/g,
  phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g,
  jwt: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  aws_key: /\bAKIA[0-9A-Z]{16}\b/g,
  private_key: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY-----/g,
  database_url: /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/g,
  github_token: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
};

const DEFAULT_POLICY_MATRIX: Record<PIIType, Record<TrustLevel, PIIAction>> = {
  ssn:          { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'block' },
  credit_card:  { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'block' },
  api_key:      { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'redact' },
  password:     { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'block' },
  email:        { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'redact', [TrustLevel.TRUSTED]: 'hash', [TrustLevel.PRIVILEGED]: 'pass' },
  phone:        { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'redact', [TrustLevel.TRUSTED]: 'hash', [TrustLevel.PRIVILEGED]: 'pass' },
  name:         { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'redact', [TrustLevel.TRUSTED]: 'redact', [TrustLevel.PRIVILEGED]: 'pass' },
  ip_address:   { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'hash', [TrustLevel.TRUSTED]: 'hash', [TrustLevel.PRIVILEGED]: 'pass' },
  jwt:          { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'redact' },
  aws_key:      { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'block' },
  private_key:  { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'block' },
  database_url: { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'redact' },
  github_token: { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'block', [TrustLevel.TRUSTED]: 'block', [TrustLevel.PRIVILEGED]: 'redact' },
  address:      { [TrustLevel.UNTRUSTED]: 'block', [TrustLevel.VERIFIED]: 'block', [TrustLevel.ATTESTED]: 'redact', [TrustLevel.TRUSTED]: 'redact', [TrustLevel.PRIVILEGED]: 'pass' },
};

export interface PIIPipelineServiceDeps {
  hashFunction: (value: string, salt: string) => string;
}

export class PIIPipelineService {
  private readonly deps: PIIPipelineServiceDeps;
  private readonly policy: PIIPolicyConfig;
  private readonly calibrations: Map<PIIType, PIICalibration>;
  private readonly confidenceThresholds: PIIConfidenceThresholds;

  constructor(
    deps: PIIPipelineServiceDeps,
    policy?: Partial<PIIPolicyConfig>,
    confidenceThresholds?: Partial<PIIConfidenceThresholds>,
  ) {
    this.deps = deps;
    this.policy = {
      defaultAction: policy?.defaultAction ?? 'redact',
      overrides: policy?.overrides ?? {},
      hashAlgorithm: policy?.hashAlgorithm ?? 'sha256',
      hashSalt: policy?.hashSalt ?? '',
      redactionPlaceholder: policy?.redactionPlaceholder ?? '[REDACTED:{type}]',
    };
    this.calibrations = new Map();
    this.confidenceThresholds = { ...DEFAULT_CONFIDENCE_THRESHOLDS, ...confidenceThresholds };
  }

  detect(text: string): PIIDetection[] {
    const detections: PIIDetection[] = [];

    for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const contextStart = Math.max(0, match.index - 20);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 20);
        const confidence = this.computeConfidence(type as PIIType, match[0], text);

        detections.push({
          type: type as PIIType,
          value: match[0],
          confidence,
          offset: match.index,
          context: text.slice(contextStart, contextEnd),
        });
      }
    }

    return detections.sort((a, b) => b.offset - a.offset);
  }

  classify(detections: PIIDetection[]): Map<PIIType, PIIDetection[]> {
    const classified = new Map<PIIType, PIIDetection[]>();

    for (const detection of detections) {
      const existing = classified.get(detection.type) ?? [];
      existing.push(detection);
      classified.set(detection.type, existing);
    }

    return classified;
  }

  evaluate(detection: PIIDetection, trustLevel: TrustLevel): PIIAction {
    if (detection.confidence < this.getEffectiveThreshold(detection.type)) {
      return 'pass';
    }

    const override = this.policy.overrides[detection.type];
    if (override?.trustLevelOverride?.[trustLevel]) {
      return override.trustLevelOverride[trustLevel]!;
    }

    const defaultMatrix = DEFAULT_POLICY_MATRIX[detection.type];
    if (defaultMatrix) {
      return defaultMatrix[trustLevel];
    }

    return this.policy.defaultAction;
  }

  transform(text: string, trustLevel: TrustLevel): PIITransformResult {
    const detections = this.detect(text);
    const actionsApplied: { type: PIIType; action: PIIAction }[] = [];
    let transformedText = text;
    let blocked = false;

    const sortedDetections = [...detections].sort((a, b) => b.offset - a.offset);

    for (const detection of sortedDetections) {
      const action = this.evaluate(detection, trustLevel);
      actionsApplied.push({ type: detection.type, action });

      switch (action) {
        case 'block':
          blocked = true;
          break;
        case 'redact': {
          const placeholder = this.policy.redactionPlaceholder.replace('{type}', detection.type);
          transformedText =
            transformedText.slice(0, detection.offset) +
            placeholder +
            transformedText.slice(detection.offset + detection.value.length);
          break;
        }
        case 'hash': {
          const hashed = this.deps.hashFunction(detection.value, this.policy.hashSalt);
          const hashPlaceholder = `[HASH:${detection.type}:${hashed.slice(0, 8)}]`;
          transformedText =
            transformedText.slice(0, detection.offset) +
            hashPlaceholder +
            transformedText.slice(detection.offset + detection.value.length);
          break;
        }
        case 'pass':
          break;
      }
    }

    return {
      originalText: text,
      transformedText: blocked ? '' : transformedText,
      detections,
      actionsApplied,
      blocked,
    };
  }

  updateCalibration(type: PIIType, calibration: PIICalibration): void {
    this.calibrations.set(type, calibration);
  }

  getCalibration(type: PIIType): PIICalibration | undefined {
    return this.calibrations.get(type);
  }

  private computeConfidence(type: PIIType, value: string, _fullText: string): number {
    const calibration = this.calibrations.get(type);
    let baseConfidence: number;

    switch (type) {
      case 'ssn':
      case 'credit_card':
      case 'aws_key':
      case 'github_token':
        baseConfidence = 0.95;
        break;
      case 'email':
      case 'jwt':
      case 'private_key':
      case 'database_url':
        baseConfidence = 0.9;
        break;
      case 'api_key':
      case 'password':
        baseConfidence = 0.85;
        break;
      case 'phone':
      case 'ip_address':
        baseConfidence = 0.8;
        break;
      case 'name':
      case 'address':
        baseConfidence = 0.7;
        break;
      default:
        baseConfidence = 0.75;
    }

    if (value.length < 5) {
      baseConfidence *= 0.8;
    }

    if (calibration && calibration.totalOverrides > 10) {
      const fpAdjustment = calibration.falsePositiveRate * 0.1;
      baseConfidence = Math.max(0.1, baseConfidence - fpAdjustment);
    }

    return Math.min(1.0, Math.max(0.0, baseConfidence));
  }

  private getEffectiveThreshold(type: PIIType): number {
    const calibration = this.calibrations.get(type);
    if (calibration && calibration.totalOverrides > 10) {
      return calibration.adjustedThreshold;
    }
    return this.confidenceThresholds.ignore;
  }

  static defaultPolicy(): PIIPolicyConfig {
    return {
      defaultAction: 'redact',
      overrides: {},
      hashAlgorithm: 'sha256',
      hashSalt: '',
      redactionPlaceholder: '[REDACTED:{type}]',
    };
  }

  static defaultPolicyMatrix(): Record<PIIType, Record<TrustLevel, PIIAction>> {
    return { ...DEFAULT_POLICY_MATRIX };
  }
}
