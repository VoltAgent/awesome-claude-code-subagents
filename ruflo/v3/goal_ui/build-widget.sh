#!/bin/bash

echo "Building RuFlo Research Widget..."
echo ""

# Build the widget
echo "Step 1/2: Building widget bundle..."
BUILD_WIDGET=true npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Widget built successfully!"
  echo ""
  echo "📦 Output files:"
  echo "   - dist/widget.js (main bundle)"
  echo "   - dist/widget.css (styles)"
  echo ""
  echo "🚀 Usage on external sites:"
  echo ""
  echo "<div id=\"ruflo-research-widget-container\"></div>"
  echo "<script src=\"https://your-domain.com/widget.js\"></script>"
  echo ""
else
  echo ""
  echo "❌ Widget build failed"
  exit 1
fi
