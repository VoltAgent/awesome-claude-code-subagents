import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Palette, Type, Copy, Check, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  textColor: string;
  secondaryTextColor: string;
  successColor: string;
  title: string;
  description: string;
  brandName: string;
  defaultGoal: string;
  fontFamily: string;
  borderRadius: string;
  animationSpeed: string;
  cardSpacing: string;
  showMetrics: boolean;
  showStats: boolean;
  compactMode: boolean;
  enableAI: boolean;
  aiModel: string;
}

interface WidgetCustomizerProps {
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
  onGenerate: () => void;
}

export const WidgetCustomizer = ({ config, onConfigChange, onGenerate }: WidgetCustomizerProps) => {
  const [copied, setCopied] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);

  const updateConfig = (key: keyof WidgetConfig, value: string | boolean) => {
    onConfigChange({ ...config, [key]: value });
  };

  const generateEmbedCode = () => {
    const embedCode = `<!-- RuFlo Research Widget -->
<div id="ruflo-research-widget-container"></div>
<script>
  window.RufloResearchWidgetConfig = ${JSON.stringify(config, null, 2)};
</script>
<script src="${window.location.origin}/widget.js"></script>
<style>
  #ruflo-research-widget-container {
    max-width: 100%;
    margin: 2rem auto;
  }
</style>`;
    return embedCode;
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ColorInput = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) => (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2 mt-1">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 h-10 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-xs"
        />
      </div>
    </div>
  );

  return (
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Customize the appearance and content of your embeddable research widget
        </p>
        <Button
          onClick={() => {
            setShowEmbedCode(!showEmbedCode);
            if (!showEmbedCode) {
              onGenerate();
            }
          }}
          size="sm"
          variant={showEmbedCode ? "outline" : "default"}
          className="w-full sm:w-auto text-xs sm:text-sm whitespace-nowrap"
        >
          {showEmbedCode ? "Hide Code" : "Generate Embed Code"}
        </Button>
      </div>

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="colors" className="text-xs sm:text-sm">Colors</TabsTrigger>
          <TabsTrigger value="content" className="text-xs sm:text-sm">Content</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs sm:text-sm">Layout</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs sm:text-sm">AI Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">Primary Colors</h3>
              <ColorInput
                id="primaryColor"
                label="Primary Color"
                value={config.primaryColor}
                onChange={(value) => updateConfig("primaryColor", value)}
              />
              <ColorInput
                id="accentColor"
                label="Accent Color"
                value={config.accentColor}
                onChange={(value) => updateConfig("accentColor", value)}
              />
              <ColorInput
                id="successColor"
                label="Success Color"
                value={config.successColor}
                onChange={(value) => updateConfig("successColor", value)}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">Background & Card Colors</h3>
              <ColorInput
                id="backgroundColor"
                label="Background Color"
                value={config.backgroundColor}
                onChange={(value) => updateConfig("backgroundColor", value)}
              />
              <ColorInput
                id="cardBackgroundColor"
                label="Card Background"
                value={config.cardBackgroundColor}
                onChange={(value) => updateConfig("cardBackgroundColor", value)}
              />
              <ColorInput
                id="cardBorderColor"
                label="Card Border"
                value={config.cardBorderColor}
                onChange={(value) => updateConfig("cardBorderColor", value)}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">Text Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorInput
                  id="textColor"
                  label="Primary Text"
                  value={config.textColor}
                  onChange={(value) => updateConfig("textColor", value)}
                />
                <ColorInput
                  id="secondaryTextColor"
                  label="Secondary Text"
                  value={config.secondaryTextColor}
                  onChange={(value) => updateConfig("secondaryTextColor", value)}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="title" className="text-xs text-muted-foreground">
                Widget Title
              </Label>
              <Input
                id="title"
                value={config.title}
                onChange={(e) => updateConfig("title", e.target.value)}
                className="mt-1"
                placeholder="Goal-Oriented Action Planning"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-xs text-muted-foreground">
                Description
              </Label>
              <Textarea
                id="description"
                value={config.description}
                onChange={(e) => updateConfig("description", e.target.value)}
                className="mt-1 min-h-[80px]"
                placeholder="AI-powered research planning..."
              />
            </div>

            <div>
              <Label htmlFor="brandName" className="text-xs text-muted-foreground">
                Brand Name (optional)
              </Label>
              <Input
                id="brandName"
                value={config.brandName}
                onChange={(e) => updateConfig("brandName", e.target.value)}
                className="mt-1"
                placeholder="Your Company"
              />
            </div>

            <div>
              <Label htmlFor="defaultGoal" className="text-xs text-muted-foreground">
                Default Research Goal
              </Label>
              <Input
                id="defaultGoal"
                value={config.defaultGoal}
                onChange={(e) => updateConfig("defaultGoal", e.target.value)}
                className="mt-1"
                placeholder="Research latest AI advancements"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layout" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">Typography & Spacing</h3>
              <div>
                <Label htmlFor="fontFamily" className="text-xs text-muted-foreground">
                  Font Family
                </Label>
                <Select value={config.fontFamily} onValueChange={(value) => updateConfig("fontFamily", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system-ui">System UI</SelectItem>
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                    <SelectItem value="'Open Sans', sans-serif">Open Sans</SelectItem>
                    <SelectItem value="'Poppins', sans-serif">Poppins</SelectItem>
                    <SelectItem value="monospace">Monospace</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="borderRadius" className="text-xs text-muted-foreground">
                  Border Radius
                </Label>
                <Select value={config.borderRadius} onValueChange={(value) => updateConfig("borderRadius", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None (0px)</SelectItem>
                    <SelectItem value="0.25rem">Small (4px)</SelectItem>
                    <SelectItem value="0.5rem">Medium (8px)</SelectItem>
                    <SelectItem value="0.75rem">Large (12px)</SelectItem>
                    <SelectItem value="1rem">XL (16px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cardSpacing" className="text-xs text-muted-foreground">
                  Card Spacing
                </Label>
                <Select value={config.cardSpacing} onValueChange={(value) => updateConfig("cardSpacing", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5rem">Tight</SelectItem>
                    <SelectItem value="1rem">Normal</SelectItem>
                    <SelectItem value="1.5rem">Relaxed</SelectItem>
                    <SelectItem value="2rem">Loose</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="animationSpeed" className="text-xs text-muted-foreground">
                  Animation Speed
                </Label>
                <Select value={config.animationSpeed} onValueChange={(value) => updateConfig("animationSpeed", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Fast</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="slow">Slow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">Display Options</h3>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showMetrics" className="text-xs text-muted-foreground">
                    Show Metrics
                  </Label>
                  <Switch
                    id="showMetrics"
                    checked={config.showMetrics}
                    onCheckedChange={(checked) => updateConfig("showMetrics", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showStats" className="text-xs text-muted-foreground">
                    Show Stats
                  </Label>
                  <Switch
                    id="showStats"
                    checked={config.showStats}
                    onCheckedChange={(checked) => updateConfig("showStats", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compactMode" className="text-xs text-muted-foreground">
                    Compact Mode
                  </Label>
                  <Switch
                    id="compactMode"
                    checked={config.compactMode}
                    onCheckedChange={(checked) => updateConfig("compactMode", checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">AI Research Settings</h3>
              <p className="text-xs text-muted-foreground">
                Configure AI-powered research data generation using Google Gemini models
              </p>
              
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAI" className="text-xs text-muted-foreground">
                    Enable AI Research
                  </Label>
                  <p className="text-[10px] text-muted-foreground/70">
                    Use AI to generate real research data instead of mock data
                  </p>
                </div>
                <Switch
                  id="enableAI"
                  checked={config.enableAI}
                  onCheckedChange={(checked) => updateConfig("enableAI", checked)}
                />
              </div>

              {config.enableAI && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="aiModel" className="text-xs text-muted-foreground">
                    AI Model
                  </Label>
                  <Select value={config.aiModel} onValueChange={(value) => updateConfig("aiModel", value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google/gemini-2.5-flash">
                        Gemini 2.5 Flash (Balanced)
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-pro">
                        Gemini 2.5 Pro (Most Powerful)
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-flash-lite">
                        Gemini 2.5 Flash Lite (Fastest)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground/70">
                    {config.aiModel === "google/gemini-2.5-pro" && "Best for complex reasoning and accuracy"}
                    {config.aiModel === "google/gemini-2.5-flash" && "Balanced performance and speed"}
                    {config.aiModel === "google/gemini-2.5-flash-lite" && "Optimized for speed and cost"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Embed Code Section */}
      {showEmbedCode && (
        <div className="space-y-3 animate-fade-in border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">Embed Code</Label>
            <Button
              onClick={copyEmbedCode}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy Code
                </>
              )}
            </Button>
          </div>
          <div className="relative">
            <pre className="bg-muted/50 border border-border rounded p-4 text-xs overflow-x-auto">
              <code className="text-foreground">{generateEmbedCode()}</code>
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy this code and paste it into your website where you want the widget to appear.
          </p>
        </div>
      )}
    </div>
  );
};
