import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { 
  Settings, 
  FileText, 
  Sliders, 
  Database,
  Sparkles,
  Target,
  Clock,
  Filter,
  RotateCcw,
  Workflow,
  Zap,
  TrendingUp,
  Building2,
  FlaskConical,
  LineChart,
  Shield,
  Rocket
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReviseResearchFormProps {
  currentGoal: string;
  onSubmit: (config: ResearchConfig) => void;
  onCancel: () => void;
  initialConfig?: ResearchConfig;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

export interface ResearchConfig {
  goal: string;
  // GOAP State Definition
  stateDefinition: {
    currentState: Record<string, boolean | string | number>;
    goalState: Record<string, boolean | string | number>;
    stateGaps: string[];
  };
  // Research Guidance
  researchGuidance: {
    focusAreas: string[];
    excludeTopics: string[];
    depth: "surface" | "moderate" | "deep";
    perspective: string;
    timeframe: string;
  };
  // AI Prompts
  prompts: {
    systemPrompt: string;
    searchQueryTemplate: string;
    analysisPrompt: string;
    synthesisPrompt: string;
  };
  // GOAP Planning Parameters
  goapConfig: {
    executionMode: "focused" | "closed" | "open";
    enableReplanning: boolean;
    replanningTriggers: string[];
    costOptimization: boolean;
    parallelExecution: boolean;
  };
  // Action Configuration
  actionConfig: {
    maxActionCost: number;
    enableFallbacks: boolean;
    validatePreconditions: boolean;
    trackEffects: boolean;
  };
  // Execution Parameters
  parameters: {
    maxSources: number;
    minConfidence: number;
    maxSteps: number;
    parallelAgents: number;
    timeout: number;
  };
  // Source Filters
  filters: {
    dateRange: string;
    sourceTypes: string[];
    languages: string[];
    excludeDomains: string[];
  };
}

export const ReviseResearchForm = ({ currentGoal, onSubmit, onCancel, initialConfig, primaryColor = "#8b5cf6", accentColor = "#22c55e", backgroundColor = "#1a1a1a" }: ReviseResearchFormProps) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<ResearchConfig>(
    initialConfig || {
      goal: currentGoal,
      stateDefinition: {
        currentState: { goalDefined: true, informationGathered: false },
        goalState: { verified: true, insightsGenerated: true },
        stateGaps: ["Information needs to be gathered", "Analysis required", "Insights need generation"],
      },
      researchGuidance: {
        focusAreas: [],
        excludeTopics: [],
        depth: "moderate",
        perspective: "technical",
        timeframe: "recent",
      },
      prompts: {
        systemPrompt: `You are an expert research assistant specializing in GOAP (Goal-Oriented Action Planning) research workflows. 
Your role is to provide precise, evidence-based information for each research step.
Format your responses as structured data points that can be used in subsequent research steps.
Always include sources, confidence levels, and timestamps when available.`,
        searchQueryTemplate: "Latest {topic} advancements {year} research site:arxiv.org OR site:scholar.google.com OR site:ieee.org",
        analysisPrompt: `Analyze the following content and extract:
1. Key findings and methodologies
2. Actionable insights and recommendations  
3. Technical details and specifications
4. Sources and citations
5. Confidence level (0-100%) based on source quality`,
        synthesisPrompt: `Synthesize the research findings into:
1. Coherent summary of key discoveries
2. Connections between different sources
3. Practical recommendations
4. Identified gaps or conflicts in the data
5. Overall confidence assessment`,
      },
      goapConfig: {
        executionMode: "closed",
        enableReplanning: true,
        replanningTriggers: ["Action failure", "Low confidence results", "Missing preconditions"],
        costOptimization: true,
        parallelExecution: true,
      },
      actionConfig: {
        maxActionCost: 5,
        enableFallbacks: true,
        validatePreconditions: true,
        trackEffects: true,
      },
      parameters: {
        maxSources: 15,
        minConfidence: 85,
        maxSteps: 7,
        parallelAgents: 3,
        timeout: 120,
      },
      filters: {
        dateRange: "past-year",
        sourceTypes: ["academic", "technical", "industry"],
        languages: ["en"],
        excludeDomains: [],
      },
    }
  );

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [focusAreaInput, setFocusAreaInput] = useState("");
  const [excludeTopicInput, setExcludeTopicInput] = useState("");
  const [excludeDomainInput, setExcludeDomainInput] = useState("");

  const presets = [
    { id: 'academic-deep', label: 'Academic Research', icon: FlaskConical, color: '#3b82f6', desc: 'Deep, rigorous academic analysis' },
    { id: 'industry-quick', label: 'Industry Quick Scan', icon: Zap, color: '#f59e0b', desc: 'Fast business insights' },
    { id: 'competitive-analysis', label: 'Competitive Intel', icon: TrendingUp, color: '#ef4444', desc: 'Market & competitor analysis' },
    { id: 'technical-feasibility', label: 'Technical Study', icon: Settings, color: '#8b5cf6', desc: 'Engineering feasibility' },
    { id: 'market-trends', label: 'Market Trends', icon: LineChart, color: '#10b981', desc: 'Trend analysis & forecasting' },
    { id: 'medical-clinical', label: 'Medical/Clinical', icon: Shield, color: '#ec4899', desc: 'Evidence-based medical research' },
    { id: 'startup-validation', label: 'Startup Validation', icon: Rocket, color: '#06b6d4', desc: 'Business idea validation' },
    { id: 'policy-regulatory', label: 'Policy & Regulatory', icon: Building2, color: '#84cc16', desc: 'Compliance & legal research' },
  ];

  const optimizeConfig = async (preset: string) => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-research-config', {
        body: { preset, currentGoal: config.goal }
      });

      if (error) throw error;

      if (data?.config) {
        setConfig({
          ...config,
          researchGuidance: {
            ...config.researchGuidance,
            ...data.config.researchGuidance
          },
          prompts: {
            ...config.prompts,
            ...data.config.prompts
          },
          parameters: {
            ...config.parameters,
            ...data.config.parameters
          },
          filters: {
            ...config.filters,
            ...data.config.filters
          },
          goapConfig: {
            ...config.goapConfig,
            ...data.config.goapConfig
          }
        });
        
        toast({
          title: "Configuration Optimized",
          description: `Settings optimized for ${preset.replace(/-/g, ' ')}`,
        });
      }
    } catch (error) {
      console.error('Error optimizing config:', error);
      toast({
        title: "Optimization Failed",
        description: "Could not optimize settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const addFocusArea = () => {
    if (focusAreaInput.trim()) {
      setConfig({
        ...config,
        researchGuidance: {
          ...config.researchGuidance,
          focusAreas: [...config.researchGuidance.focusAreas, focusAreaInput.trim()],
        },
      });
      setFocusAreaInput("");
    }
  };

  const removeFocusArea = (index: number) => {
    setConfig({
      ...config,
      researchGuidance: {
        ...config.researchGuidance,
        focusAreas: config.researchGuidance.focusAreas.filter((_, i) => i !== index),
      },
    });
  };

  const addExcludeTopic = () => {
    if (excludeTopicInput.trim()) {
      setConfig({
        ...config,
        researchGuidance: {
          ...config.researchGuidance,
          excludeTopics: [...config.researchGuidance.excludeTopics, excludeTopicInput.trim()],
        },
      });
      setExcludeTopicInput("");
    }
  };

  const removeExcludeTopic = (index: number) => {
    setConfig({
      ...config,
      researchGuidance: {
        ...config.researchGuidance,
        excludeTopics: config.researchGuidance.excludeTopics.filter((_, i) => i !== index),
      },
    });
  };

  const addExcludeDomain = () => {
    if (excludeDomainInput.trim()) {
      setConfig({
        ...config,
        filters: {
          ...config.filters,
          excludeDomains: [...config.filters.excludeDomains, excludeDomainInput.trim()],
        },
      });
      setExcludeDomainInput("");
    }
  };

  const removeExcludeDomain = (index: number) => {
    setConfig({
      ...config,
      filters: {
        ...config.filters,
        excludeDomains: config.filters.excludeDomains.filter((_, i) => i !== index),
      },
    });
  };

  const handleSubmit = () => {
    onSubmit(config);
  };

  return (
    <div className="space-y-4">
      {/* AI Optimization Presets */}
      <div 
        className="p-4 rounded-lg border space-y-3"
        style={{
          backgroundColor: `${primaryColor}0d`,
          borderColor: `${primaryColor}33`
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: primaryColor }} />
          <span className="text-sm font-medium" style={{ color: primaryColor }}>
            AI-Optimize Settings by Research Type:
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => optimizeConfig(preset.id)}
              disabled={isOptimizing}
              className="flex flex-col items-start gap-1 px-3 py-2 rounded-md transition-all text-xs border hover:shadow-sm"
              style={{
                borderColor: isOptimizing ? preset.color : '#404040',
                backgroundColor: '#262626',
              }}
              title={preset.desc}
            >
              <div className="flex items-center gap-1.5 w-full">
                <preset.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: preset.color }} />
                <span className="font-medium text-foreground text-left leading-tight">{preset.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{preset.desc}</span>
            </button>
          ))}
        </div>
        {isOptimizing && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: primaryColor }}>
            <Sparkles className="w-3 h-3 animate-spin" />
            Optimizing research configuration...
          </p>
        )}
      </div>

      {/* Description Header */}
      <div 
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: `${primaryColor}0d`,
          borderColor: `${primaryColor}33`
        }}
      >
        <p className="text-sm text-muted-foreground">
          Fine-tune how the AI conducts research by configuring GOAP planning parameters, AI prompts, execution settings, and source filters.
        </p>
      </div>

      <Tabs defaultValue="guidance" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1 h-auto p-1 bg-muted/50">
          <TabsTrigger value="guidance" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guidance</span>
            <span className="sm:hidden">Guide</span>
          </TabsTrigger>
          <TabsTrigger value="goap" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Workflow className="w-3.5 h-3.5" />
            <span>GOAP</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prompts</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="parameters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Parameters</span>
            <span className="sm:hidden">Params</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Actions</span>
            <span className="sm:hidden">Acts</span>
          </TabsTrigger>
          <TabsTrigger value="filters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            <span className="sm:hidden">Filt</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guidance" className="space-y-3 mt-4">
          <Card className="border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4" style={{ color: primaryColor }} />
                Research Guidance
              </CardTitle>
              <CardDescription className="text-xs">
                Define the scope and direction of your research
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="goal" className="text-xs font-medium">Research Goal</Label>
                <Textarea
                  id="goal"
                  value={config.goal}
                  onChange={(e) => setConfig({ ...config, goal: e.target.value })}
                  placeholder="Enter your research objective..."
                  className="min-h-[70px] text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Focus Areas <span className="text-muted-foreground font-normal">(specific topics to emphasize)</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={focusAreaInput}
                    onChange={(e) => setFocusAreaInput(e.target.value)}
                    placeholder="e.g., quantum algorithms, error correction"
                    onKeyPress={(e) => e.key === "Enter" && addFocusArea()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addFocusArea} size="sm" className="h-9 px-3 text-xs">Add</Button>
                </div>
                {config.researchGuidance.focusAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {config.researchGuidance.focusAreas.map((area, index) => (
                      <span
                        key={index}
                        className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors"
                        style={{
                          backgroundColor: `${primaryColor}1a`,
                          color: primaryColor
                        }}
                      >
                        {area}
                        <button
                          onClick={() => removeFocusArea(index)}
                          className="hover:opacity-70 transition-opacity"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Exclude Topics</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeTopicInput}
                    onChange={(e) => setExcludeTopicInput(e.target.value)}
                    placeholder="e.g., theoretical only, consumer products"
                    onKeyPress={(e) => e.key === "Enter" && addExcludeTopic()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addExcludeTopic} size="sm" variant="outline" className="h-9 px-3 text-xs">Add</Button>
                </div>
                {config.researchGuidance.excludeTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {config.researchGuidance.excludeTopics.map((topic, index) => (
                      <span
                        key={index}
                        className="bg-destructive/10 text-destructive px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
                      >
                        {topic}
                        <button
                          onClick={() => removeExcludeTopic(index)}
                          className="hover:opacity-70"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Research Depth</Label>
                  <Select
                    value={config.researchGuidance.depth}
                    onValueChange={(value: "surface" | "moderate" | "deep") =>
                      setConfig({
                        ...config,
                        researchGuidance: { ...config.researchGuidance, depth: value },
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="surface">Surface (Quick overview)</SelectItem>
                      <SelectItem value="moderate">Moderate (Standard depth)</SelectItem>
                      <SelectItem value="deep">Deep (Comprehensive analysis)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Perspective</Label>
                  <Select
                    value={config.researchGuidance.perspective}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        researchGuidance: { ...config.researchGuidance, perspective: value },
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical/Scientific</SelectItem>
                      <SelectItem value="business">Business/Commercial</SelectItem>
                      <SelectItem value="academic">Academic/Research</SelectItem>
                      <SelectItem value="practical">Practical/Applied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Timeframe Focus</Label>
                <Select
                  value={config.researchGuidance.timeframe}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      researchGuidance: { ...config.researchGuidance, timeframe: value },
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recent (Last 6 months)</SelectItem>
                    <SelectItem value="current-year">Current Year</SelectItem>
                    <SelectItem value="past-year">Past Year</SelectItem>
                    <SelectItem value="past-2-years">Past 2 Years</SelectItem>
                    <SelectItem value="all-time">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5" />
                GOAP Configuration
              </CardTitle>
              <CardDescription>
                Configure Goal-Oriented Action Planning parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Execution Mode</Label>
                <Select
                  value={config.goapConfig.executionMode}
                  onValueChange={(value: "focused" | "closed" | "open") =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, executionMode: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="focused">Focused (Direct execution)</SelectItem>
                    <SelectItem value="closed">Closed (Single-domain planning)</SelectItem>
                    <SelectItem value="open">Open (Creative problem solving)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config.goapConfig.executionMode === "focused" && "Execute specific actions with precondition checking"}
                  {config.goapConfig.executionMode === "closed" && "Plan within defined action set with type safety"}
                  {config.goapConfig.executionMode === "open" && "Explore all actions and discover novel combinations"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Replanning</Label>
                  <p className="text-xs text-muted-foreground">Adjust plan when actions fail</p>
                </div>
                <Switch
                  checked={config.goapConfig.enableReplanning}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, enableReplanning: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cost Optimization</Label>
                  <p className="text-xs text-muted-foreground">Find most efficient action paths</p>
                </div>
                <Switch
                  checked={config.goapConfig.costOptimization}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, costOptimization: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Parallel Execution</Label>
                  <p className="text-xs text-muted-foreground">Run independent actions simultaneously</p>
                </div>
                <Switch
                  checked={config.goapConfig.parallelExecution}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, parallelExecution: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Replanning Triggers</Label>
                <div className="space-y-2">
                  {["Action failure", "Low confidence results", "Missing preconditions", "Timeout exceeded", "State mismatch"].map((trigger) => (
                    <div key={trigger} className="flex items-center space-x-2">
                      <Switch
                        id={trigger}
                        checked={config.goapConfig.replanningTriggers.includes(trigger)}
                        onCheckedChange={(checked) => {
                          const newTriggers = checked
                            ? [...config.goapConfig.replanningTriggers, trigger]
                            : config.goapConfig.replanningTriggers.filter((t) => t !== trigger);
                          setConfig({
                            ...config,
                            goapConfig: { ...config.goapConfig, replanningTriggers: newTriggers },
                          });
                        }}
                        style={{
                          ['--primary' as any]: primaryColor,
                        }}
                      />
                      <Label htmlFor={trigger} className="cursor-pointer text-sm">
                        {trigger}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI Prompts Configuration
              </CardTitle>
              <CardDescription>
                Customize the AI prompts used during research
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={config.prompts.systemPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, systemPrompt: e.target.value },
                    })
                  }
                  placeholder="Define the AI's role and behavior..."
                  className="min-h-[100px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="searchQuery">Search Query Template</Label>
                <Textarea
                  id="searchQuery"
                  value={config.prompts.searchQueryTemplate}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, searchQueryTemplate: e.target.value },
                    })
                  }
                  placeholder="Use {topic} and {year} placeholders..."
                  className="min-h-[80px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: {"{topic}"}, {"{year}"}, {"{keywords}"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="analysisPrompt">Document Analysis Prompt</Label>
                <Textarea
                  id="analysisPrompt"
                  value={config.prompts.analysisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, analysisPrompt: e.target.value },
                    })
                  }
                  placeholder="Instructions for analyzing documents..."
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="synthesisPrompt">Synthesis Prompt</Label>
                <Textarea
                  id="synthesisPrompt"
                  value={config.prompts.synthesisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, synthesisPrompt: e.target.value },
                    })
                  }
                  placeholder="Instructions for synthesizing findings..."
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parameters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-5 h-5" />
                Research Parameters
              </CardTitle>
              <CardDescription>
                Fine-tune the research execution settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Maximum Sources</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.maxSources}</span>
                </div>
                <Slider
                  value={[config.parameters.maxSources]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, maxSources: value[0] },
                    })
                  }
                  min={5}
                  max={50}
                  step={5}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Minimum Confidence (%)</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.minConfidence}%</span>
                </div>
                <Slider
                  value={[config.parameters.minConfidence]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, minConfidence: value[0] },
                    })
                  }
                  min={50}
                  max={99}
                  step={5}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Maximum Research Steps</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.maxSteps}</span>
                </div>
                <Slider
                  value={[config.parameters.maxSteps]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, maxSteps: value[0] },
                    })
                  }
                  min={3}
                  max={15}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Parallel Agents</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.parallelAgents}</span>
                </div>
                <Slider
                  value={[config.parameters.parallelAgents]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, parallelAgents: value[0] },
                    })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Timeout (seconds)</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.timeout}s</span>
                </div>
                <Slider
                  value={[config.parameters.timeout]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, timeout: value[0] },
                    })
                  }
                  min={30}
                  max={300}
                  step={30}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Action Configuration
              </CardTitle>
              <CardDescription>
                Configure how actions are validated and executed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Maximum Action Cost</Label>
                  <span className="text-sm text-muted-foreground">{config.actionConfig.maxActionCost}</span>
                </div>
                <Slider
                  value={[config.actionConfig.maxActionCost]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, maxActionCost: value[0] },
                    })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Limit complexity of individual actions in the plan
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Fallbacks</Label>
                  <p className="text-xs text-muted-foreground">Use alternative actions when primary fails</p>
                </div>
                <Switch
                  checked={config.actionConfig.enableFallbacks}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, enableFallbacks: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Validate Preconditions</Label>
                  <p className="text-xs text-muted-foreground">Check all requirements before executing actions</p>
                </div>
                <Switch
                  checked={config.actionConfig.validatePreconditions}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, validatePreconditions: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Track Effects</Label>
                  <p className="text-xs text-muted-foreground">Monitor state changes from each action</p>
                </div>
                <Switch
                  checked={config.actionConfig.trackEffects}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, trackEffects: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Source Filters
              </CardTitle>
              <CardDescription>
                Control which sources are included in research
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select
                  value={config.filters.dateRange}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      filters: { ...config.filters, dateRange: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="past-week">Past Week</SelectItem>
                    <SelectItem value="past-month">Past Month</SelectItem>
                    <SelectItem value="past-3-months">Past 3 Months</SelectItem>
                    <SelectItem value="past-6-months">Past 6 Months</SelectItem>
                    <SelectItem value="past-year">Past Year</SelectItem>
                    <SelectItem value="past-2-years">Past 2 Years</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Source Types</Label>
                <div className="space-y-2">
                  {["academic", "technical", "industry", "news", "blogs", "documentation"].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Switch
                        id={type}
                        checked={config.filters.sourceTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          const newTypes = checked
                            ? [...config.filters.sourceTypes, type]
                            : config.filters.sourceTypes.filter((t) => t !== type);
                          setConfig({
                            ...config,
                            filters: { ...config.filters, sourceTypes: newTypes },
                          });
                        }}
                      />
                      <Label htmlFor={type} className="capitalize cursor-pointer">
                        {type}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Exclude Domains</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeDomainInput}
                    onChange={(e) => setExcludeDomainInput(e.target.value)}
                    placeholder="e.g., example.com"
                    onKeyPress={(e) => e.key === "Enter" && addExcludeDomain()}
                  />
                  <Button onClick={addExcludeDomain} size="sm">Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.filters.excludeDomains.map((domain, index) => (
                    <span
                      key={index}
                      className="bg-muted px-3 py-1 rounded-full text-sm flex items-center gap-2"
                    >
                      {domain}
                      <button
                        onClick={() => removeExcludeDomain(index)}
                        className="hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Languages</Label>
                <div className="space-y-2">
                  {[
                    { code: "en", label: "English" },
                    { code: "es", label: "Spanish" },
                    { code: "fr", label: "French" },
                    { code: "de", label: "German" },
                    { code: "zh", label: "Chinese" },
                    { code: "ja", label: "Japanese" },
                  ].map(({ code, label }) => (
                    <div key={code} className="flex items-center space-x-2">
                      <Switch
                        id={code}
                        checked={config.filters.languages.includes(code)}
                        onCheckedChange={(checked) => {
                          const newLangs = checked
                            ? [...config.filters.languages, code]
                            : config.filters.languages.filter((l) => l !== code);
                          setConfig({
                            ...config,
                            filters: { ...config.filters, languages: newLangs },
                          });
                        }}
                      />
                      <Label htmlFor={code} className="cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Start Revised Research
        </Button>
      </div>
    </div>
  );
};