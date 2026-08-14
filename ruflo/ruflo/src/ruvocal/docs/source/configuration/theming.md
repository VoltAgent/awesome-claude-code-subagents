# Theming

Customize the look and feel of Chat UI with these environment variables:

```ini
PUBLIC_APP_NAME=ChatUI
PUBLIC_APP_ASSETS=chatui
PUBLIC_APP_DESCRIPTION="Making the community's best AI chat models available to everyone."
```

- `PUBLIC_APP_NAME` - The name used as a title throughout the app
- `PUBLIC_APP_ASSETS` - Directory for logos & favicons in `static/$PUBLIC_APP_ASSETS`. Options: `chatui`, `huggingchat`
- `PUBLIC_APP_DESCRIPTION` - Description shown in meta tags and about sections

## Additional Options

```ini
PUBLIC_APP_DATA_SHARING=1    # Show data sharing opt-in toggle in settings
PUBLIC_ORIGIN=https://chat.example.com  # Your public URL (required for sharing)
```
