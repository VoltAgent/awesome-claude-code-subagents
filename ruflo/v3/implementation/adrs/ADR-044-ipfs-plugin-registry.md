# ADR-044: Live IPFS Plugin Registry on Google Cloud

## Status
Proposed

## Context

The current plugin discovery system uses a demo mode with hardcoded plugins. When IPNS resolution fails (which it always does since the client is stubbed), it falls back to `getDemoPlugins()`.

We need a production-ready plugin registry that:
1. Is decentralized and censorship-resistant (IPFS)
2. Has stable addressing (IPNS)
3. Is verifiable (Ed25519 signatures)
4. Is easy to update (CI/CD pipeline)
5. Has low latency (CDN caching)

## Decision

Implement a hybrid architecture using:
- **Google Cloud Storage (GCS)**: Source of truth for registry data
- **Pinata**: IPFS pinning service for decentralized distribution
- **IPNS**: Stable naming via Pinata's IPNS API
- **Cloud Functions**: Registry publishing automation
- **Ed25519**: Registry signature verification

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Publishing Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐     ┌─────────────┐     ┌─────────┐               │
│  │ GitHub  │────▶│ Cloud Build │────▶│   GCS   │               │
│  │  Push   │     │  (CI/CD)    │     │ Bucket  │               │
│  └─────────┘     └─────────────┘     └────┬────┘               │
│                                           │                     │
│                         ┌─────────────────┘                     │
│                         ▼                                       │
│                  ┌─────────────┐                                │
│                  │   Cloud     │                                │
│                  │  Function   │                                │
│                  │  (Publish)  │                                │
│                  └──────┬──────┘                                │
│                         │                                       │
│           ┌─────────────┼─────────────┐                        │
│           ▼             ▼             ▼                        │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│    │  Pinata  │  │  IPNS    │  │  Sign    │                   │
│    │  Pin     │  │  Update  │  │ Registry │                   │
│    └──────────┘  └──────────┘  └──────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Discovery Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ Claude Flow │────▶│   Resolve   │────▶│   Fetch     │       │
│  │    CLI      │     │    IPNS     │     │    IPFS     │       │
│  └─────────────┘     └──────┬──────┘     └──────┬──────┘       │
│                             │                    │              │
│                    ┌────────┴────────┐   ┌──────┴──────┐       │
│                    ▼                 ▼   ▼             ▼       │
│             ┌──────────┐      ┌──────────┐      ┌──────────┐   │
│             │ dweb.link│      │ ipfs.io  │      │ Pinata   │   │
│             │ Gateway  │      │ Gateway  │      │ Gateway  │   │
│             └──────────┘      └──────────┘      └──────────┘   │
│                                                                 │
│                    ┌─────────────────────┐                     │
│                    │   Verify Signature  │                     │
│                    │   (Ed25519)         │                     │
│                    └─────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### Phase 1: Google Cloud Setup

1. **Create GCS Bucket**
```bash
# Create bucket for registry data
gcloud storage buckets create gs://claude-flow-plugin-registry \
  --location=US \
  --uniform-bucket-level-access

# Enable versioning for rollback
gsutil versioning set on gs://claude-flow-plugin-registry
```

2. **Create Service Account**
```bash
# Service account for Cloud Functions
gcloud iam service-accounts create plugin-registry-publisher \
  --display-name="Plugin Registry Publisher"

# Grant permissions
gsutil iam ch serviceAccount:plugin-registry-publisher@PROJECT.iam.gserviceaccount.com:objectViewer gs://claude-flow-plugin-registry
```

### Phase 2: Pinata Setup

1. **Create Pinata Account** at https://pinata.cloud
2. **Generate API Keys** (JWT for authentication)
3. **Create IPNS Key** for stable addressing

```typescript
// scripts/setup-pinata.ts
import PinataSDK from '@pinata/sdk';

const pinata = new PinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretApiKey: process.env.PINATA_SECRET_KEY,
});

// Generate IPNS key for the registry
async function setupIPNS() {
  const keyName = 'claude-flow-official-registry';
  const key = await pinata.generateKey({
    keyName,
    permissions: {
      endpoints: {
        pinning: {
          pinFileToIPFS: true,
          pinJSONToIPFS: true,
        },
      },
    },
  });

  console.log('IPNS Key:', key);
  // Save this key securely - it's needed for updates
}
```

### Phase 3: Registry Schema

```typescript
// src/plugins/store/registry-schema.ts
import { z } from 'zod';

export const PluginEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string(),
  cid: z.string(), // IPFS CID of the plugin tarball
  size: z.number(),
  checksum: z.string(), // sha256:xxx
  author: z.object({
    id: z.string(),
    displayName: z.string(),
    verified: z.boolean(),
  }),
  license: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  downloads: z.number(),
  rating: z.number(),
  lastUpdated: z.string().datetime(),
  minClaudeFlowVersion: z.string(),
  dependencies: z.array(z.object({
    name: z.string(),
    version: z.string(),
  })),
  type: z.enum(['core', 'command', 'integration', 'agent', 'theme']),
  hooks: z.array(z.string()),
  commands: z.array(z.string()),
  permissions: z.array(z.string()),
  exports: z.array(z.string()),
  verified: z.boolean(),
  trustLevel: z.enum(['official', 'verified', 'community', 'unverified']),
  securityAudit: z.object({
    auditor: z.string(),
    auditDate: z.string().datetime(),
    passed: z.boolean(),
  }).optional(),
});

export const PluginRegistrySchema = z.object({
  version: z.string(),
  type: z.literal('plugins'),
  updatedAt: z.string().datetime(),
  ipnsName: z.string(),
  plugins: z.array(PluginEntrySchema),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    pluginCount: z.number(),
  })),
  totalPlugins: z.number(),
  totalDownloads: z.number(),
  featured: z.array(z.string()),
  trending: z.array(z.string()),
  newest: z.array(z.string()),
  official: z.array(z.string()),
  // Ed25519 signature of the registry content
  registrySignature: z.string().optional(),
  registryPublicKey: z.string().optional(),
});

export type PluginEntry = z.infer<typeof PluginEntrySchema>;
export type PluginRegistry = z.infer<typeof PluginRegistrySchema>;
```

### Phase 4: Publishing Cloud Function

```typescript
// cloud-functions/publish-registry/index.ts
import { Storage } from '@google-cloud/storage';
import PinataSDK from '@pinata/sdk';
import * as ed from '@noble/ed25519';
import { PluginRegistrySchema } from './schema';

const storage = new Storage();
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
});

export async function publishRegistry(req: any, res: any) {
  try {
    // 1. Fetch registry from GCS
    const bucket = storage.bucket('claude-flow-plugin-registry');
    const file = bucket.file('registry.json');
    const [content] = await file.download();
    const registry = JSON.parse(content.toString());

    // 2. Validate schema
    const validated = PluginRegistrySchema.parse(registry);

    // 3. Sign registry
    const privateKey = Buffer.from(process.env.REGISTRY_PRIVATE_KEY!, 'hex');
    const message = JSON.stringify(validated);
    const signature = await ed.signAsync(
      new TextEncoder().encode(message),
      privateKey
    );

    validated.registrySignature = Buffer.from(signature).toString('hex');
    validated.registryPublicKey = `ed25519:${Buffer.from(
      await ed.getPublicKeyAsync(privateKey)
    ).toString('hex')}`;

    // 4. Pin to IPFS via Pinata
    const pinResult = await pinata.pinJSONToIPFS(validated, {
      pinataMetadata: {
        name: 'claude-flow-plugin-registry',
        keyvalues: {
          version: validated.version,
          updatedAt: validated.updatedAt,
        },
      },
    });

    console.log(`Pinned to IPFS: ${pinResult.IpfsHash}`);

    // 5. Update IPNS pointer
    // Note: Pinata's IPNS update requires their Dedicated Gateways plan
    // Alternative: Use web3.storage's w3name or run your own IPFS node

    res.json({
      success: true,
      cid: pinResult.IpfsHash,
      gateway: `https://gateway.pinata.cloud/ipfs/${pinResult.IpfsHash}`,
      publicGateway: `https://ipfs.io/ipfs/${pinResult.IpfsHash}`,
    });
  } catch (error) {
    console.error('Publish failed:', error);
    res.status(500).json({ error: String(error) });
  }
}
```

### Phase 5: Update IPFS Client

```typescript
// src/transfer/ipfs/client.ts (updated)
import * as crypto from 'crypto';

const GATEWAYS = [
  'https://gateway.pinata.cloud',
  'https://cloudflare-ipfs.com',
  'https://ipfs.io',
  'https://dweb.link',
];

const IPNS_RESOLVERS = [
  'https://gateway.pinata.cloud',
  'https://dweb.link',
];

/**
 * Resolve IPNS name to CID with fallback
 */
export async function resolveIPNS(
  ipnsName: string,
  preferredGateway?: string
): Promise<string | null> {
  const resolvers = preferredGateway
    ? [preferredGateway, ...IPNS_RESOLVERS]
    : IPNS_RESOLVERS;

  for (const gateway of resolvers) {
    try {
      // DNSLink resolution for human-readable names
      if (ipnsName.includes('.')) {
        const response = await fetch(
          `${gateway}/api/v0/name/resolve?arg=/ipns/${ipnsName}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (response.ok) {
          const data = await response.json();
          return data.Path?.replace('/ipfs/', '') || null;
        }
      }

      // Standard IPNS key resolution
      const response = await fetch(`${gateway}/ipns/${ipnsName}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      // Extract CID from redirect URL
      const finalUrl = response.url;
      const cidMatch = finalUrl.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      if (cidMatch) {
        return cidMatch[1];
      }
    } catch (error) {
      console.warn(`[IPFS] Gateway ${gateway} failed:`, error);
      continue;
    }
  }

  return null;
}

/**
 * Fetch content from IPFS with fallback gateways
 */
export async function fetchFromIPFS<T>(
  cid: string,
  preferredGateway?: string
): Promise<T | null> {
  const gateways = preferredGateway
    ? [preferredGateway, ...GATEWAYS]
    : GATEWAYS;

  for (const gateway of gateways) {
    try {
      const url = `${gateway}/ipfs/${cid}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[IPFS] Fetched from ${gateway}`);
        return data as T;
      }
    } catch (error) {
      console.warn(`[IPFS] Gateway ${gateway} failed:`, error);
      continue;
    }
  }

  return null;
}

/**
 * Verify Ed25519 signature
 */
export async function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const ed = await import('@noble/ed25519');
    const pubKeyHex = publicKey.replace('ed25519:', '');
    return await ed.verifyAsync(
      Buffer.from(signature, 'hex'),
      new TextEncoder().encode(message),
      Buffer.from(pubKeyHex, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Check if CID is pinned on a gateway
 */
export async function isPinned(
  cid: string,
  gateway: string = 'https://ipfs.io'
): Promise<boolean> {
  try {
    const response = await fetch(`${gateway}/ipfs/${cid}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getGatewayUrl(cid: string, gateway: string = 'https://ipfs.io'): string {
  return `${gateway}/ipfs/${cid}`;
}

export function isValidCID(cid: string): boolean {
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(cid);
}

export function hashContent(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
```

### Phase 6: Update Discovery Service

```typescript
// Update DEFAULT_PLUGIN_STORE_CONFIG in discovery.ts
export const DEFAULT_PLUGIN_STORE_CONFIG: PluginStoreConfig = {
  registries: [
    {
      name: 'claude-flow-official',
      description: 'Official Claude Flow plugin registry',
      // Real IPNS name from Pinata
      ipnsName: 'k51qzi5uqu5dl...', // Your actual IPNS key
      gateway: 'https://gateway.pinata.cloud',
      publicKey: 'ed25519:...', // Your public key
      trusted: true,
      official: true,
    },
  ],
  defaultRegistry: 'claude-flow-official',
  gateway: 'https://gateway.pinata.cloud',
  timeout: 30000,
  cacheDir: '.claude-flow/plugins/cache',
  cacheExpiry: 3600000,
  requireVerification: true,
  requireSecurityAudit: false,
  minTrustLevel: 'community',
  trustedAuthors: ['claude-flow-team'],
  blockedPlugins: [],
  allowedPermissions: ['network', 'filesystem', 'memory', 'hooks'],
  requirePermissionPrompt: true,
};
```

## Cost Estimate

| Service | Monthly Cost |
|---------|--------------|
| Pinata Free | $0 (1GB pinned, 100 pins) |
| Pinata Picnic | $20 (100GB, 10K pins) |
| GCS (< 1GB) | ~$0.02 |
| Cloud Function | ~$0 (free tier) |
| **Total** | **$0 - $20/month** |

## Security Considerations

1. **Registry Signing**: All registries are signed with Ed25519
2. **Plugin Verification**: Each plugin has a checksum
3. **Trust Levels**: official > verified > community > unverified
4. **Gateway Fallback**: Multiple gateways prevent single point of failure
5. **Rate Limiting**: Cloud Function has rate limits

## Rollback Strategy

1. GCS versioning enables instant rollback
2. Previous IPFS CIDs remain accessible
3. IPNS pointer can be reverted

## Alternatives Considered

1. **Self-hosted IPFS Node**: More control, more maintenance
2. **web3.storage**: Free tier with Filecoin backing, but less reliable
3. **GCS-only**: Simpler but loses decentralization benefits
4. **Filebase**: S3-compatible but costs more

## References

- [Pinata API Docs](https://docs.pinata.cloud/)
- [IPNS Spec](https://docs.ipfs.tech/concepts/ipns/)
- [Ed25519 Signatures](https://ed25519.cr.yp.to/)
- [Google Cloud Functions](https://cloud.google.com/functions)
