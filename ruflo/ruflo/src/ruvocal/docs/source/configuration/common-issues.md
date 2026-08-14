# Common Issues

## 403: You don't have access to this conversation

This usually happens when running Chat UI over HTTP without proper cookie configuration.

**Recommended:** Set up a reverse proxy (NGINX, Caddy) to handle HTTPS.

**Alternative:** If you must run over HTTP, configure cookies:

```ini
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

Also ensure `PUBLIC_ORIGIN` matches your actual URL:

```ini
PUBLIC_ORIGIN=http://localhost:5173
```

## Models not loading

If models aren't appearing in the UI:

1. Verify `OPENAI_BASE_URL` is correct and accessible
2. Check that `OPENAI_API_KEY` is valid
3. Ensure the endpoint returns models at `${OPENAI_BASE_URL}/models`

## Database connection errors

For development, you can skip MongoDB entirely - Chat UI will use an embedded database.

For production, verify:

- `MONGODB_URL` is a valid connection string
- Your IP is whitelisted (for MongoDB Atlas)
- The database user has read/write permissions
