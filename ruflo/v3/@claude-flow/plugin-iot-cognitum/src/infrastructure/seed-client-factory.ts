import { SeedClient } from '@cognitum-one/sdk/seed';
import type { SeedClientOptions } from '@cognitum-one/sdk/seed';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SeedClientFactoryConfig {
  /** TLS defaults applied to every client unless overridden per-call. */
  defaultTls?: { insecure?: boolean; ca?: string };
  /** Timeout defaults (ms). */
  defaultTimeouts?: { connect?: number; read?: number; total?: number };
  /** Max retry attempts beyond the first. Default 2. */
  defaultRetries?: number;
  /** Active health-probe interval (ms). Disabled when undefined. */
  healthInterval?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and manages {@link SeedClient} instances. This is the ONLY file
 * that imports from `@cognitum-one/sdk/seed` directly — all other layers
 * receive a `SeedClient` via dependency injection.
 */
export class SeedClientFactory {
  private readonly config: Required<
    Pick<SeedClientFactoryConfig, 'defaultRetries'>
  > &
    SeedClientFactoryConfig;

  /** Keyed by the first endpoint string. */
  private readonly clients: Map<string, SeedClient> = new Map();

  constructor(config?: SeedClientFactoryConfig) {
    this.config = {
      defaultRetries: 2,
      ...config,
    };
  }

  /**
   * Build a {@link SeedClient} for `endpoint` (single URL or multi-peer
   * array) with an optional pairing token. The client is cached by its
   * first endpoint so subsequent calls with the same key return the same
   * instance.
   */
  async createClient(
    endpoint: string | string[],
    pairingToken?: string,
  ): Promise<SeedClient> {
    const key = Array.isArray(endpoint) ? endpoint[0] : endpoint;

    const existing = this.clients.get(key);
    if (existing) return existing;

    const options: SeedClientOptions = {
      endpoints: endpoint,
      auth: pairingToken ? { pairingToken } : undefined,
      tls: {
        insecure: this.config.defaultTls?.insecure ?? true,
        ca: this.config.defaultTls?.ca,
      },
      timeouts: this.config.defaultTimeouts ?? {
        connect: 5_000,
        read: 10_000,
        total: 30_000,
      },
      retries: this.config.defaultRetries,
      healthInterval: this.config.healthInterval,
    };

    const client = new SeedClient(options);
    this.clients.set(key, client);
    return client;
  }

  /** Retrieve a previously created client by its primary endpoint. */
  getClient(endpoint: string): SeedClient | undefined {
    return this.clients.get(endpoint);
  }

  /** Close every managed client and clear the internal map. */
  async closeAll(): Promise<void> {
    const closing: Array<void | Promise<void>> = [];
    for (const client of this.clients.values()) {
      closing.push(client.close());
    }
    await Promise.all(closing);
    this.clients.clear();
  }
}
