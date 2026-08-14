# OpenID

By default, users are attributed a unique ID based on their browser session. To authenticate users with OpenID Connect, configure the following:

```ini
OPENID_CLIENT_ID=your_client_id
OPENID_CLIENT_SECRET=your_client_secret
OPENID_SCOPES="openid profile"
```

Use the provider URL for standard OpenID Connect discovery:

```ini
OPENID_PROVIDER_URL=https://your-provider.com
```

Advanced: you can also provide a client metadata document via `OPENID_CONFIG`. This value must be a JSON/JSON5 object (for example, a CIMD document) and is parsed server‑side to populate OpenID settings.

**Redirect URI:** `https://your-domain.com/login/callback`

## Access Control

Restrict access to specific users:

```ini
# Allow only specific email addresses
ALLOWED_USER_EMAILS=["user@example.com", "admin@example.com"]

# Allow all users from specific domains
ALLOWED_USER_DOMAINS=["example.com", "company.org"]
```

## Hugging Face Login

For Hugging Face authentication, you can use automatic client registration:

```ini
OPENID_CLIENT_ID=__CIMD__
```

This creates an OAuth app automatically when deployed. See the [CIMD spec](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) for details.

## User Token Forwarding

When users log in via Hugging Face, you can forward their token for inference:

```ini
USE_USER_TOKEN=true
```

## Auto-Login

Force authentication on all routes:

```ini
AUTOMATIC_LOGIN=true
```
