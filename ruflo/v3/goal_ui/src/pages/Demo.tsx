import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const Demo = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  const embedCode = `<!-- RuFlo Research Widget -->
<div id="ruflo-research-widget-container"></div>

<!-- Optional: Configure widget appearance -->
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

<!-- Load widget styles -->
<link rel="stylesheet" href="${window.location.origin}/widget.css">

<!-- Load the widget -->
<script src="${window.location.origin}/widget.js"></script>`;

  useEffect(() => {
    // Configure widget before loading
    (window as any).RufloResearchWidgetConfig = {
      primaryColor: "#8b5cf6",
      accentColor: "#22c55e",
      backgroundColor: "#1a1a1a",
      cardBackgroundColor: "#262626",
      textColor: "#ffffff",
      fontFamily: "system-ui",
      defaultGoal: "Research the latest advancements in quantum computing"
    };

    // Check if widget.js and widget.css exist
    const checkWidget = async () => {
      let link: HTMLLinkElement | null = null;
      let script: HTMLScriptElement | null = null;

      try {
        const [jsCheck, cssCheck] = await Promise.all([
          fetch("/widget.js", { method: "HEAD" }),
          fetch("/widget.css", { method: "HEAD" })
        ]);

        if (!jsCheck.ok || !cssCheck.ok) {
          toast({
            title: "Widget Not Built",
            description: "Run: npm run build:widget",
            variant: "destructive",
          });
          return;
        }

        // Load CSS first
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/widget.css";
        link.onerror = () => {
          console.error("[Demo] Failed to load widget.css");
          toast({
            title: "Widget CSS Load Failed",
            description: "Could not load widget styles",
            variant: "destructive",
          });
        };
        document.head.appendChild(link);

        // Wait a bit for CSS to load
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then load JS
        script = document.createElement("script");
        script.src = "/widget.js";
        script.crossOrigin = "anonymous";
        script.onload = () => {
          setWidgetLoaded(true);
          console.log("[Demo] Widget loaded successfully");

          // Check if widget initialized
          if ((window as any).RufloResearchWidget) {
            console.log("[Demo] Widget version:", (window as any).RufloResearchWidget.version);
            toast({
              title: "Widget Ready",
              description: "RuFlo Research Widget loaded successfully",
            });
          }
        };
        script.onerror = () => {
          console.error("[Demo] Failed to load widget.js");
          toast({
            title: "Widget Load Failed",
            description: "Check console for errors. Run: npm run build:widget",
            variant: "destructive",
          });
        };

        document.body.appendChild(script);
      } catch (error) {
        console.error("[Demo] Widget check failed:", error);
        toast({
          title: "Widget Check Failed",
          description: "Could not verify widget files exist",
          variant: "destructive",
        });
      }

      // Cleanup function
      return () => {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        if (link && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        // Clear widget config
        delete (window as any).RufloResearchWidgetConfig;
        delete (window as any).RufloResearchWidget;
      };
    };

    const cleanup = checkWidget();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [toast]);

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Button>
          </Link>
          <div className="text-sm text-muted-foreground">
            {widgetLoaded ? "✅ Widget Active" : "⏳ Loading Widget..."}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Embeddable Widget Demo</h1>
          <p className="text-muted-foreground">
            This page demonstrates how the GOAP widget works when embedded on external websites
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Embed Code</CardTitle>
            <CardDescription>
              Copy this code to embed the widget on your website. The widget is fully self-contained
              with CORS enabled for third-party embedding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                <code>{embedCode}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={copyEmbedCode}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <h4 className="text-sm font-semibold mb-2">Widget Features</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>✅ Fully standalone (no dependencies)</li>
                  <li>✅ CORS-enabled for cross-domain use</li>
                  <li>✅ Customizable colors and styling</li>
                  <li>✅ Mobile-responsive design</li>
                  <li>✅ AI-powered research workflows</li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Configuration Options</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <code>primaryColor</code> - Main theme color</li>
                  <li>• <code>accentColor</code> - Accent/success color</li>
                  <li>• <code>backgroundColor</code> - Page background</li>
                  <li>• <code>defaultGoal</code> - Pre-filled goal text</li>
                  <li>• <a href="/WIDGET-INTEGRATION.md" target="_blank" className="text-primary hover:underline">View full docs →</a></li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="border-t border-border pt-8">
          <h2 className="text-2xl font-semibold mb-4">Live Widget Preview</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This is the actual widget as it would appear on an external site. The widget below is loaded
            using the exact same code shown above.
          </p>

          {!widgetLoaded && (
            <div className="mb-4 p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <p className="text-sm">Loading widget...</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                If the widget doesn't load, run: <code className="bg-background px-2 py-0.5 rounded">npm run build:widget</code>
              </p>
            </div>
          )}

          {/* Widget Container */}
          <div
            id="ruflo-research-widget-container"
            className="min-h-[600px] rounded-lg border border-border overflow-hidden"
            style={{
              background: widgetLoaded ? 'transparent' : 'repeating-linear-gradient(45deg, rgba(255,255,255,.05), rgba(255,255,255,.05) 10px, transparent 10px, transparent 20px)'
            }}
          />
        </div>
      </main>
    </div>
  );
};

export default Demo;
