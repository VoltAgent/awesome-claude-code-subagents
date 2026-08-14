# RuFlo Research Widget - Embeddable Research Interface

## Overview
The GOAP widget is a fully-featured, embeddable research planning interface with 100% fidelity to the main application. It can be embedded on any website using a simple script tag.

## Features
✅ Complete GOAP planning workflow
✅ AI-powered research with Gemini integration  
✅ State assessment and configuration display
✅ Full research report modal
✅ Customizable appearance via configuration
✅ Self-contained bundle with all dependencies

## Building the Widget

To generate the embeddable `widget.js` file:

```bash
# Using the build script
chmod +x build-widget.sh
./build-widget.sh

# Or manually
BUILD_WIDGET=true npm run build
```

This creates:
- `dist/widget.js` - Standalone IIFE bundle with all dependencies
- `dist/widget.css` - Compiled styles

The widget.js is a self-contained bundle that includes:
- React & React DOM
- All UI components
- Supabase client
- TanStack Query
- All dependencies inlined

## Embedding on External Sites

### Basic Embed

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site with RuFlo Research Widget</title>
</head>
<body>
  <!-- Widget Container -->
  <div id="ruflo-research-widget-container"></div>

  <!-- Load Widget Script -->
  <script src="https://your-domain.com/widget.js"></script>
</body>
</html>
```

### With Custom Configuration

```html
<div id="ruflo-research-widget-container"></div>

<script>
  // Configure widget appearance (optional)
  window.RufloResearchWidgetConfig = {
    primaryColor: "#8b5cf6",
    accentColor: "#22c55e",
    backgroundColor: "#1a1a1a",
    cardBackgroundColor: "#262626",
    textColor: "#ffffff",
    fontFamily: "system-ui",
    defaultGoal: "Research the latest advancements in quantum computing"
  };
</script>

<script src="https://your-domain.com/widget.js"></script>
```

### Custom Container ID

```html
<div id="my-custom-container"></div>

<script>
  window.RufloResearchWidgetConfig = { /* ... */ };
</script>

<script src="https://your-domain.com/widget.js"></script>
<script>
  // Manually initialize with custom container
  window.RufloResearchWidget.init('my-custom-container');
</script>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `primaryColor` | string | `#8b5cf6` | Primary brand color |
| `accentColor` | string | `#22c55e` | Accent/success color |
| `backgroundColor` | string | `#1a1a1a` | Background color |
| `cardBackgroundColor` | string | `#262626` | Card background |
| `textColor` | string | `#ffffff` | Primary text color |
| `fontFamily` | string | `system-ui` | Font family |
| `defaultGoal` | string | - | Pre-populated research goal |

## API

The widget exposes a global `RufloResearchWidget` object:

```javascript
window.RufloResearchWidget = {
  init: (containerId?: string) => void,
  version: string
}
```

### Methods

- **`init(containerId)`**: Manually initialize the widget in a specific container
- **`version`**: Current widget version

## Testing Locally

1. Build the widget:
   ```bash
   npm run build
   ```

2. Serve the dist folder:
   ```bash
   npx serve dist
   ```

3. Open the example embed page:
   ```
   http://localhost:3000/widget-embed.html
   ```

## Demo Page

Visit `/demo` in your application to see:
- Live widget preview
- Copyable embed code
- Integration instructions
- Configuration examples

## Requirements

- Modern browser with ES2015+ support
- Container element with a unique ID
- Internet connection for AI features (Gemini API)

## Supabase Integration

The widget includes full Supabase integration for:
- AI-powered goal generation
- Research step execution
- Configuration optimization
- Report generation

Ensure your Supabase project is configured with the required edge functions:
- `generate-research-goal`
- `research-step`
- `optimize-research-config`
- `generate-action-items`

## Troubleshooting

### Widget not appearing
- Check browser console for errors
- Verify the container ID matches
- Ensure widget.js is loaded correctly

### Styling conflicts
- Widget uses scoped CSS variables
- Customize via `RufloResearchWidgetConfig`
- Override specific styles if needed

### API errors
- Verify Supabase configuration
- Check edge function deployment
- Review network requests in DevTools

## Support

For issues or questions:
- Check the demo page at `/demo`
- Review console logs with `[RuFlo Research]` prefix
- Inspect network requests for API failures
