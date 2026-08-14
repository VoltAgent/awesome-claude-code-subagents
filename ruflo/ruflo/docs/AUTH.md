# Authentication Setup

## Google OIDC (Recommended)

HF Chat UI has native OpenID Connect support. Google OAuth is the easiest to set up.

### 1. Create OAuth Client

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: `https://YOUR_DOMAIN/login/callback`
5. Copy the **Client ID** and **Client Secret**

### 2. Store the Secret

```bash
echo -n "GOCSPX-your-client-secret" | gcloud secrets create google-client-secret \
  --data-file=- --project=YOUR_PROJECT
```

### 3. Configure

In `config/config.json`:

```json
{
  "auth": {
    "enabled": true,
    "provider": "google",
    "clientId": "123456789-abc.apps.googleusercontent.com",
    "clientSecretName": "google-client-secret",
    "scopes": "openid profile email",
    "nameClaim": "name"
  }
}
```

### 4. Deploy

The deploy script automatically adds `OPENID_*` env vars and binds the secret.

## Disabling Auth

Set `auth.enabled: false` in config.json. The chat will be publicly accessible.

## Custom OIDC Providers

Any OpenID Connect provider works. Change the provider URL in the generated `dotenv-local.txt`:

```
OPENID_PROVIDER_URL=https://your-idp.com
OPENID_CLIENT_ID=your-client-id
```

Supported providers: Google, Microsoft Entra ID, Auth0, Okta, Keycloak, etc.
