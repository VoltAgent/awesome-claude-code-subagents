# RuFlo Research Widget Integration Guide

## 📦 Overview

The RuFlo Research Widget is a standalone, embeddable component that brings Goal-Oriented Action Planning research capabilities to any website. It's fully self-contained with no external dependencies required on the host page.

## 🚀 Quick Start

### Basic Integration

Add this code to any HTML page:

```html
<!-- 1. Add widget container -->
<div id="ruflo-research-widget-container"></div>

<!-- 2. Load widget files -->
<link rel="stylesheet" href="https://YOUR-DOMAIN/widget.css">
<script src="https://YOUR-DOMAIN/widget.js"></script>
```

That's it! The widget will automatically initialize.

### With Configuration

```html
<!-- Widget container -->
<div id="ruflo-research-widget-container"></div>

<!-- Configuration (optional) -->
<script>
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

<!-- Load widget -->
<link rel="stylesheet" href="https://YOUR-DOMAIN/widget.css">
<script src="https://YOUR-DOMAIN/widget.js"></script>
```

## ⚙️ Configuration Options

All configuration options are optional. The widget will use sensible defaults.

```javascript
window.RufloResearchWidgetConfig = {
  // Colors (use hex format)
  primaryColor: "#8b5cf6",          // Main brand color
  accentColor: "#22c55e",           // Success/highlight color
  backgroundColor: "#1a1a1a",       // Page background
  cardBackgroundColor: "#262626",   // Card backgrounds
  cardBorderColor: "#404040",       // Card borders
  textColor: "#ffffff",             // Primary text
  secondaryTextColor: "#a3a3a3",    // Secondary text
  successColor: "#22c55e",          // Success indicators

  // Content
  title: "Goal-Oriented Action Planning",
  description: "AI-powered research planning...",
  brandName: "Your Brand",
  defaultGoal: "Default research goal",

  // Styling
  fontFamily: "system-ui",          // Font family
  borderRadius: "0.5rem",           // Border radius for cards
  animationSpeed: "normal",         // Animation speed: "slow", "normal", "fast"
  cardSpacing: "1rem",              // Space between cards

  // Features
  showMetrics: true,                // Show step metrics
  showStats: true,                  // Show statistics
  compactMode: false,               // Compact layout
  enableAI: true,                   // Enable AI features
  aiModel: "google/gemini-2.5-flash" // AI model to use
};
```

## 🎨 Custom Container

Use a custom container ID:

```html
<div id="my-custom-container"></div>

<script>
  window.addEventListener('load', function() {
    if (window.RufloResearchWidget) {
      window.RufloResearchWidget.init('my-custom-container');
    }
  });
</script>
```

## 🌐 CORS & Security

### CORS Headers

The widget files are configured with proper CORS headers to work on any domain:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
```

### Content Security Policy

If your site uses CSP, add these directives:

```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' https://YOUR-DOMAIN;
               style-src 'self' https://YOUR-DOMAIN 'unsafe-inline';">
```

### Iframe Embedding

To embed via iframe:

```html
<iframe
  src="https://YOUR-DOMAIN/widget-embed.html"
  width="100%"
  height="800"
  frameborder="0"
  style="border: none;">
</iframe>
```

## 📱 Responsive Design

The widget is fully responsive and mobile-friendly. It will automatically adapt to:
- Mobile devices (< 640px)
- Tablets (640px - 1024px)
- Desktops (> 1024px)

## 🔧 Advanced Usage

### Manual Initialization

Disable auto-initialization and manually control when the widget loads:

```javascript
// The widget auto-initializes by default
// To prevent this, load the widget script with defer
<script src="/widget.js" defer></script>

// Then manually initialize when ready
window.addEventListener('DOMContentLoaded', function() {
  if (window.RufloResearchWidget) {
    window.RufloResearchWidget.init('ruflo-research-widget-container');
  }
});
```

### Version Check

Check the widget version:

```javascript
console.log(window.RufloResearchWidget.version); // "1.0.0"
```

### Multiple Widgets

Load multiple widgets on the same page:

```html
<div id="widget-1"></div>
<div id="widget-2"></div>

<script>
  window.addEventListener('load', function() {
    window.RufloResearchWidget.init('widget-1');
    window.RufloResearchWidget.init('widget-2');
  });
</script>
```

## 🐛 Troubleshooting

### Widget Not Loading

1. Check browser console for errors
2. Verify widget.js and widget.css URLs are correct
3. Check CORS headers are properly configured
4. Ensure container element exists before widget loads

### CORS Errors

If you see CORS errors:
```
Access to script at 'https://your-domain/widget.js' from origin 'https://other-domain'
has been blocked by CORS policy
```

Solutions:
1. Ensure `_headers` file is deployed with proper CORS headers
2. Check your hosting platform's CORS configuration
3. For Netlify: Ensure `netlify.toml` is configured correctly

### Styling Issues

If widget styling looks broken:
1. Ensure widget.css is loaded before widget.js
2. Check for CSS conflicts with your site's styles
3. Try adding `!important` to widget container styles
4. Use a unique ID for the widget container

### Performance Issues

For large pages or slow connections:
1. Load widget files with `defer` or `async`
2. Place widget at the bottom of the page
3. Use lazy loading for the widget container

## 📊 Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari 12+, Chrome Android latest

## 🔒 Privacy & Data

- Widget runs entirely client-side
- No data collection by default
- AI features connect to configured backend only when used
- No cookies or local storage used without explicit configuration

## 📝 Example Implementations

### WordPress

```php
<?php
// Add to your theme's functions.php
function add_goap_widget() {
  ?>
  <div id="ruflo-research-widget-container"></div>
  <script>
    window.RufloResearchWidgetConfig = {
      primaryColor: "<?php echo get_theme_mod('primary_color', '#8b5cf6'); ?>",
      defaultGoal: "<?php echo get_option('goap_default_goal'); ?>"
    };
  </script>
  <link rel="stylesheet" href="https://YOUR-DOMAIN/widget.css">
  <script src="https://YOUR-DOMAIN/widget.js"></script>
  <?php
}
add_action('wp_footer', 'add_goap_widget');
?>
```

### React/Next.js

```javascript
import { useEffect } from 'react';

export default function RufloResearchWidget() {
  useEffect(() => {
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://YOUR-DOMAIN/widget.js';
    script.async = true;
    document.body.appendChild(script);

    // Load widget CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://YOUR-DOMAIN/widget.css';
    document.head.appendChild(link);

    return () => {
      document.body.removeChild(script);
      document.head.removeChild(link);
    };
  }, []);

  return <div id="ruflo-research-widget-container" />;
}
```

### Vue.js

```vue
<template>
  <div id="ruflo-research-widget-container"></div>
</template>

<script>
export default {
  mounted() {
    // Set configuration
    window.RufloResearchWidgetConfig = {
      primaryColor: this.$root.theme.primaryColor
    };

    // Load widget
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://YOUR-DOMAIN/widget.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://YOUR-DOMAIN/widget.js';
    document.body.appendChild(script);
  }
}
</script>
```

## 📦 Build Your Own

To build the widget from source:

```bash
# Install dependencies
npm install

# Build widget
npm run build:widget

# Output will be in dist/widget.js and dist/widget.css
```

## 🤝 Support

- Documentation: [View README](./README.md)
- Issues: [GitHub Issues](https://github.com/ruvnet/goap-ui/issues)
- Demo: [Live Demo](https://lovable.dev/projects/598e2f1d-b876-4347-bb4f-379bdab134b0)

## 📄 License

MIT License - See LICENSE file for details
