# Deployment Guide

## ✅ Pre-Deployment Checklist

Before deploying, ensure:

1. **Widget files are built**: Run `npm run build`
   - This builds widget first, then the main app
   - Widget files end up in `dist/` folder

2. **Required files in dist/**:
   - ✅ `widget.js` (595KB)
   - ✅ `widget.css` (65KB)
   - ✅ `widget-embed.html`
   - ✅ `_headers` (CORS configuration)
   - ✅ `_redirects` (routing rules)

3. **Verify locally**:
   ```bash
   npm run build
   npm run preview
   # Visit http://localhost:4173/demo
   ```

## 🚀 Netlify Deployment

### Build Settings

Ensure your Netlify site has these build settings:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: 18 or higher (set in Environment Variables: `NODE_VERSION=18`)

### Deployment Process

1. **Push to Git**:
   ```bash
   git add .
   git commit -m "Add widget embed system"
   git push origin main
   ```

2. **Netlify will automatically**:
   - Run `npm install`
   - Run `npm run build`
   - Deploy `dist/` folder
   - Apply `_headers` and `_redirects` rules

3. **Verify deployment**:
   - Visit `https://your-domain.com/widget.js` - should return JavaScript
   - Visit `https://your-domain.com/widget.css` - should return CSS
   - Visit `https://your-domain.com/demo` - should load widget demo
   - Visit `https://your-domain.com/widget-embed.html` - should show embed example

## 🔍 Troubleshooting

### Widget files 404 error

**Symptom**: `widget.js` and `widget.css` return 404

**Solutions**:

1. **Check build logs**:
   - Look for "BUILD_WIDGET=true vite build" in logs
   - Ensure both widget and app builds completed

2. **Verify _redirects file**:
   - Check if `_redirects` file exists in deployed site
   - Should contain explicit rules for widget files

3. **Clear Netlify cache**:
   ```bash
   # In Netlify dashboard:
   Site settings > Build & deploy > Clear cache and retry deploy
   ```

4. **Manual verification**:
   ```bash
   # Locally verify build output
   npm run build
   ls -la dist/ | grep widget
   # Should show widget.js, widget.css, widget-embed.html
   ```

### CORS errors

**Symptom**: Widget loads on same domain but fails on external sites

**Solution**: Verify `_headers` file contains:
```
/widget.js
  Access-Control-Allow-Origin: *
  Content-Type: application/javascript; charset=utf-8

/widget.css
  Access-Control-Allow-Origin: *
  Content-Type: text/css; charset=utf-8
```

### SPA routing issues

**Symptom**: Direct URLs to `/demo` return 404

**Solution**: The `_redirects` file should have the SPA fallback as the LAST rule:
```
/* /index.html 200
```

## 📦 Manual Build & Deploy

If automatic deployment fails, you can build and deploy manually:

```bash
# 1. Build locally
npm run build

# 2. Verify files
ls -la dist/ | grep -E "(widget|_headers|_redirects)"

# 3. Deploy via Netlify CLI
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

## 🔗 Widget URLs After Deployment

Once deployed, your widget will be available at:

- **Widget script**: `https://your-domain.com/widget.js`
- **Widget styles**: `https://your-domain.com/widget.css`
- **Demo page**: `https://your-domain.com/demo`
- **Embed example**: `https://your-domain.com/widget-embed.html`

## 📝 Embed Code for Third-Party Sites

Share this code with users who want to embed the widget:

```html
<!-- RuFlo Research Widget Container -->
<div id="ruflo-research-widget-container"></div>

<!-- Configuration (optional) -->
<script>
  window.RufloResearchWidgetConfig = {
    primaryColor: "#8b5cf6",
    accentColor: "#22c55e",
    backgroundColor: "#1a1a1a"
  };
</script>

<!-- Load Widget -->
<link rel="stylesheet" href="https://your-domain.com/widget.css">
<script src="https://your-domain.com/widget.js"></script>
```

## 🛠️ Environment Variables

No environment variables are required for the widget to work. However, if you're using Supabase functions, ensure these are set in Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## ✨ Post-Deployment Testing

After deployment, test:

1. **Main app**: Visit homepage, create a research goal
2. **Demo page**: Visit `/demo`, verify widget loads
3. **Widget files**: Direct access to `/widget.js` and `/widget.css`
4. **Embed example**: Visit `/widget-embed.html`
5. **CORS**: Test widget on external domain (e.g., CodePen, JSFiddle)

## 📊 Monitoring

Monitor widget usage:
- Check Netlify Analytics for `/widget.js` and `/widget.css` requests
- Use browser DevTools Network tab to verify CORS headers
- Monitor error logs for failed widget loads

## 🔄 Updating the Widget

When you make changes:

1. Update source code
2. Run `npm run build` locally to test
3. Commit and push to Git
4. Netlify auto-deploys
5. Widget updates are live immediately (users may need to clear cache)

## 💾 Caching Strategy

The `_headers` file sets:
- Widget files: 1 year cache (`max-age=31536000`)
- Immutable flag for faster loads

To force users to get new version:
- Change widget version in code
- Or rename files (e.g., `widget.v2.js`)
- Or use cache busting query params
