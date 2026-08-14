# ADR-031: HF Chat UI History Persistence Across Redeployments

## Status
Proposed (2026-03-04)

## Date
2026-03-04

## Problem

Chat history in HF Chat UI (`chat.conveyorclaims.ai`) is lost every time the Cloud Run service is redeployed. Users lose all conversations, settings, and assistant context.

## Root Cause

The HF Chat UI Docker image (`ghcr.io/huggingface/chat-ui-db:latest`) bundles MongoDB as a **sidecar process** inside the same container. The `MONGODB_URL=mongodb://localhost:27017` configuration connects to this local MongoDB instance, meaning:

1. MongoDB data is stored on the **container's ephemeral filesystem**
2. Cloud Run containers are **stateless** — filesystem is wiped on every new revision
3. Every `gcloud run deploy` or `gcloud builds submit` creates a new revision → new container → empty MongoDB
4. Min-instances=1 keeps ONE container alive, but redeployment replaces it

## Current Architecture (Broken)

```
┌─────────────────────────────────────┐
│  Cloud Run Container (ephemeral)    │
│                                     │
│  ┌──────────┐   ┌───────────────┐  │
│  │ HF Chat  │──▶│   MongoDB     │  │
│  │ UI (Node)│   │ (localhost)   │  │
│  │          │   │               │  │
│  └──────────┘   │ DATA LOST ON  │  │
│                 │ REDEPLOYMENT  │  │
│                 └───────────────┘  │
└─────────────────────────────────────┘
```

## Proposed Solutions

### Option A: External MongoDB Atlas (Recommended)

Use MongoDB Atlas free tier (M0) or shared cluster. HF Chat UI natively supports external MongoDB via `MONGODB_URL`.

**Changes required:**
- Create MongoDB Atlas cluster (free M0 tier: 512MB storage, shared RAM)
- Set `MONGODB_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net` in Cloud Run env
- Store credentials in Secret Manager as `mongodb-url`
- Update `cloudbuild.yaml` to use `--set-secrets=MONGODB_URL=mongodb-url:latest`

**Pros:** Zero code changes, native support, free tier available, managed backups
**Cons:** External dependency, network latency (~10-30ms), 512MB limit on free tier

**Cost:** Free (M0) or ~$9/mo (M2 shared, 2GB)

### Option B: Cloud SQL for MongoDB-Compatible (Firestore)

Use Firestore in MongoDB-compatible mode (Datastore mode). HF Chat UI may require a MongoDB wire protocol proxy.

**Pros:** Fully managed, GCP-native, scales to zero
**Cons:** Not wire-compatible with MongoDB driver, would need code changes or proxy

### Option C: Persistent Volume via Cloud Run Volume Mounts

Mount a GCS bucket or NFS share as a volume for MongoDB data.

**Changes required:**
- Create GCS bucket for MongoDB data
- Add `--add-volume` and `--add-volume-mount` to Cloud Run deploy
- Configure MongoDB to use mounted path for data directory

**Pros:** No external MongoDB needed, data persists in GCS
**Cons:** GCS FUSE has latency, not ideal for database workloads, MongoDB may not perform well on FUSE mounts

### Option D: Dedicated MongoDB VM

Run MongoDB on a Compute Engine VM (similar to ruvector-postgres-vm pattern).

**Pros:** Full control, predictable performance, persistent
**Cons:** Operational overhead, cost (~$25/mo for e2-small), manual backups

## Recommendation

**Option A (MongoDB Atlas)** — simplest path:

1. Create free M0 cluster on `cloud.mongodb.com`
2. Whitelist Cloud Run egress IPs (or use 0.0.0.0/0 with strong credentials)
3. Create `conveyor-chat` database
4. Store connection string in Secret Manager
5. Update `cloudbuild.yaml`:
   ```yaml
   '--set-secrets', '...MONGODB_URL=mongodb-atlas-url:latest'
   ```
6. Remove `MONGODB_URL=mongodb://localhost:27017` from env vars and `.env.local`

## Data Preserved After Fix

| Data Type | Currently Persists? | After Fix |
|-----------|-------------------|-----------|
| Chat conversations | No (lost on redeploy) | Yes |
| User preferences | No | Yes |
| Model selections | No | Yes |
| Shared conversations | No | Yes |
| Assistant configurations | No | Yes |
| Uploaded files metadata | No | Yes |

## Implementation Steps

1. Create MongoDB Atlas account and M0 cluster
2. Create database user with readWrite role on `conveyor-chat`
3. Store connection string in Secret Manager: `mongodb-atlas-url`
4. Update `infrastructure/gcp/hf-chat-ui/cloudbuild.yaml` — add secret binding
5. Update `infrastructure/gcp/hf-chat-ui/update-preprompt.js` — remove localhost MongoDB URL
6. Update `infrastructure/gcp/hf-chat-ui/dotenv-local.txt` — remove MONGODB_URL line
7. Deploy and verify conversations persist across redeployments
8. Migrate any existing conversations if needed (likely none worth migrating)

## Related ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-029 | HF Chat UI deployment architecture |
| ADR-030 | MCP tool gap analysis |
