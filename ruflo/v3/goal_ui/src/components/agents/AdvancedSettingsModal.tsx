import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Settings2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdvancedSettings {
  // Swarm Configuration
  swarm: {
    topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
    maxAgents: number;
    strategy: 'balanced' | 'specialized' | 'adaptive';
    autoScaling: {
      enabled: boolean;
      minAgents: number;
      maxAgents: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
    };
  };
  
  // GOAP Configuration
  goap: {
    algorithm: 'a-star' | 'greedy' | 'dijkstra' | 'bfs' | 'dfs';
    heuristic: 'manhattan' | 'euclidean' | 'hamming' | 'custom';
    costMethod: 'uniform' | 'time' | 'resources' | 'tokens' | 'hybrid';
    optimization: {
      enabled: boolean;
      detectParallel: boolean;
      removeRedundant: boolean;
    };
  };
  
  // Execution Configuration
  execution: {
    strategy: 'sequential' | 'parallel' | 'hybrid' | 'adaptive';
    maxParallelTasks: number;
    timeout: number;
    enableQualityGates: boolean;
  };
  
  // Model Router Configuration
  modelRouter: {
    primaryProvider: 'anthropic' | 'openrouter' | 'gemini' | 'local';
    strategy: 'cost' | 'speed' | 'quality' | 'privacy' | 'balanced';
    maxCostPerRequest: number;
    enableFallback: boolean;
  };
}

const defaultSettings: AdvancedSettings = {
  swarm: {
    topology: 'hierarchical',
    maxAgents: 10,
    strategy: 'adaptive',
    autoScaling: {
      enabled: true,
      minAgents: 2,
      maxAgents: 20,
      scaleUpThreshold: 80,
      scaleDownThreshold: 20,
    },
  },
  goap: {
    algorithm: 'a-star',
    heuristic: 'manhattan',
    costMethod: 'hybrid',
    optimization: {
      enabled: true,
      detectParallel: true,
      removeRedundant: true,
    },
  },
  execution: {
    strategy: 'adaptive',
    maxParallelTasks: 5,
    timeout: 300000,
    enableQualityGates: true,
  },
  modelRouter: {
    primaryProvider: 'anthropic',
    strategy: 'balanced',
    maxCostPerRequest: 1.0,
    enableFallback: true,
  },
};

const presets = {
  development: {
    name: 'Development',
    description: 'Fast iteration, verbose logging',
    badge: 'default' as const,
  },
  production: {
    name: 'Production',
    description: 'Optimized performance, strict validation',
    badge: 'default' as const,
  },
  budget: {
    name: 'Budget',
    description: 'Cost-optimized, slower execution',
    badge: 'secondary' as const,
  },
  quality: {
    name: 'Quality',
    description: 'Maximum quality, higher cost',
    badge: 'destructive' as const,
  },
};

export function AdvancedSettingsModal() {
  const [settings, setSettings] = useState<AdvancedSettings>(() => {
    const saved = localStorage.getItem('agenticflow-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSave = () => {
    localStorage.setItem('agenticflow-settings', JSON.stringify(settings));
    toast({
      title: "Settings Saved",
      description: "Your advanced configuration has been saved.",
    });
    setOpen(false);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    toast({
      title: "Settings Reset",
      description: "Configuration has been reset to defaults.",
    });
  };

  const applyPreset = (presetName: keyof typeof presets) => {
    const presetConfigs: Record<keyof typeof presets, Partial<AdvancedSettings>> = {
      development: {
        swarm: { ...settings.swarm, maxAgents: 5, strategy: 'balanced' },
        execution: { ...settings.execution, strategy: 'sequential', enableQualityGates: false },
        modelRouter: { ...settings.modelRouter, strategy: 'speed' },
      },
      production: {
        swarm: { ...settings.swarm, maxAgents: 15, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'adaptive', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, strategy: 'balanced' },
      },
      budget: {
        swarm: { ...settings.swarm, maxAgents: 3, strategy: 'specialized' },
        execution: { ...settings.execution, strategy: 'sequential', maxParallelTasks: 2 },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'openrouter', strategy: 'cost' },
      },
      quality: {
        swarm: { ...settings.swarm, maxAgents: 20, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'parallel', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'anthropic', strategy: 'quality' },
      },
    };

    setSettings({ ...settings, ...presetConfigs[presetName] });
    toast({
      title: `${presets[presetName].name} Preset Applied`,
      description: presets[presetName].description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Advanced Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            Advanced Agent Configuration
          </DialogTitle>
          <DialogDescription>
            Configure swarm topology, GOAP planning, execution strategy, and model routing
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="space-y-2">
          <Label>Quick Presets</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(presets).map(([key, preset]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(key as keyof typeof presets)}
                className="flex flex-col h-auto py-3 items-start"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{preset.name}</span>
                  <Badge variant={preset.badge} className="text-xs">
                    {key}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {preset.description}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="swarm" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="swarm">Swarm</TabsTrigger>
            <TabsTrigger value="goap">GOAP</TabsTrigger>
            <TabsTrigger value="execution">Execution</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>

          {/* Swarm Configuration */}
          <TabsContent value="swarm" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="topology">Topology</Label>
              <Select
                value={settings.swarm.topology}
                onValueChange={(value: AdvancedSettings['swarm']['topology']) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, topology: value } })
                }
              >
                <SelectTrigger id="topology">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mesh">Mesh - Fully connected, peer-to-peer</SelectItem>
                  <SelectItem value="hierarchical">Hierarchical - Tree structure with coordinators</SelectItem>
                  <SelectItem value="ring">Ring - Circular communication</SelectItem>
                  <SelectItem value="star">Star - Centralized coordinator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAgents">Maximum Agents: {settings.swarm.maxAgents}</Label>
              <Slider
                id="maxAgents"
                min={1}
                max={50}
                step={1}
                value={[settings.swarm.maxAgents]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, maxAgents: value } })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strategy">Distribution Strategy</Label>
              <Select
                value={settings.swarm.strategy}
                onValueChange={(value: AdvancedSettings['swarm']['strategy']) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, strategy: value } })
                }
              >
                <SelectTrigger id="strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced - Evenly distribute tasks</SelectItem>
                  <SelectItem value="specialized">Specialized - Assign based on capabilities</SelectItem>
                  <SelectItem value="adaptive">Adaptive - Dynamic based on load</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoScaling">Auto-Scaling</Label>
                <Switch
                  id="autoScaling"
                  checked={settings.swarm.autoScaling.enabled}
                  onCheckedChange={(enabled) =>
                    setSettings({
                      ...settings,
                      swarm: {
                        ...settings.swarm,
                        autoScaling: { ...settings.swarm.autoScaling, enabled },
                      },
                    })
                  }
                />
              </div>

              {settings.swarm.autoScaling.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Agents</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.swarm.autoScaling.minAgents}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            swarm: {
                              ...settings.swarm,
                              autoScaling: {
                                ...settings.swarm.autoScaling,
                                minAgents: parseInt(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Agents</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.swarm.autoScaling.maxAgents}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            swarm: {
                              ...settings.swarm,
                              autoScaling: {
                                ...settings.swarm.autoScaling,
                                maxAgents: parseInt(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Scale Up Threshold (%): {settings.swarm.autoScaling.scaleUpThreshold}</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[settings.swarm.autoScaling.scaleUpThreshold]}
                      onValueChange={([value]) =>
                        setSettings({
                          ...settings,
                          swarm: {
                            ...settings.swarm,
                            autoScaling: { ...settings.swarm.autoScaling, scaleUpThreshold: value },
                          },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Scale Down Threshold (%): {settings.swarm.autoScaling.scaleDownThreshold}</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[settings.swarm.autoScaling.scaleDownThreshold]}
                      onValueChange={([value]) =>
                        setSettings({
                          ...settings,
                          swarm: {
                            ...settings.swarm,
                            autoScaling: { ...settings.swarm.autoScaling, scaleDownThreshold: value },
                          },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* GOAP Configuration */}
          <TabsContent value="goap" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="algorithm">Planning Algorithm</Label>
              <Select
                value={settings.goap.algorithm}
                onValueChange={(value: AdvancedSettings['goap']['algorithm']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, algorithm: value } })
                }
              >
                <SelectTrigger id="algorithm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a-star">A* - Optimal pathfinding</SelectItem>
                  <SelectItem value="greedy">Greedy - Fast, not optimal</SelectItem>
                  <SelectItem value="dijkstra">Dijkstra - Guaranteed optimal</SelectItem>
                  <SelectItem value="bfs">BFS - Breadth-first search</SelectItem>
                  <SelectItem value="dfs">DFS - Depth-first search</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heuristic">Heuristic Function</Label>
              <Select
                value={settings.goap.heuristic}
                onValueChange={(value: AdvancedSettings['goap']['heuristic']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, heuristic: value } })
                }
              >
                <SelectTrigger id="heuristic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manhattan">Manhattan Distance</SelectItem>
                  <SelectItem value="euclidean">Euclidean Distance</SelectItem>
                  <SelectItem value="hamming">Hamming Distance</SelectItem>
                  <SelectItem value="custom">Custom Heuristic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costMethod">Cost Calculation Method</Label>
              <Select
                value={settings.goap.costMethod}
                onValueChange={(value: AdvancedSettings['goap']['costMethod']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, costMethod: value } })
                }
              >
                <SelectTrigger id="costMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uniform">Uniform - All actions same cost</SelectItem>
                  <SelectItem value="time">Time - Based on execution time</SelectItem>
                  <SelectItem value="resources">Resources - Based on resource usage</SelectItem>
                  <SelectItem value="tokens">Tokens - Based on token consumption</SelectItem>
                  <SelectItem value="hybrid">Hybrid - Combination of factors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <Label>Optimization Options</Label>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Optimization</Label>
                  <p className="text-xs text-muted-foreground">Optimize generated plans</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.enabled}
                  onCheckedChange={(enabled) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, enabled } },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Detect Parallel Actions</Label>
                  <p className="text-xs text-muted-foreground">Find actions that can run concurrently</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.detectParallel}
                  onCheckedChange={(detectParallel) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, detectParallel } },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Remove Redundant Actions</Label>
                  <p className="text-xs text-muted-foreground">Eliminate unnecessary steps</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.removeRedundant}
                  onCheckedChange={(removeRedundant) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, removeRedundant } },
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* Execution Configuration */}
          <TabsContent value="execution" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="execStrategy">Execution Strategy</Label>
              <Select
                value={settings.execution.strategy}
                onValueChange={(value: AdvancedSettings['execution']['strategy']) =>
                  setSettings({ ...settings, execution: { ...settings.execution, strategy: value } })
                }
              >
                <SelectTrigger id="execStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential - One task at a time</SelectItem>
                  <SelectItem value="parallel">Parallel - Maximum concurrency</SelectItem>
                  <SelectItem value="hybrid">Hybrid - Mixed approach</SelectItem>
                  <SelectItem value="adaptive">Adaptive - Dynamic based on load</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxParallelTasks">Max Parallel Tasks: {settings.execution.maxParallelTasks}</Label>
              <Slider
                id="maxParallelTasks"
                min={1}
                max={20}
                step={1}
                value={[settings.execution.maxParallelTasks]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, execution: { ...settings.execution, maxParallelTasks: value } })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds): {settings.execution.timeout / 1000}</Label>
              <Slider
                id="timeout"
                min={30000}
                max={900000}
                step={30000}
                value={[settings.execution.timeout]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, execution: { ...settings.execution, timeout: value } })
                }
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/30">
              <div className="space-y-0.5">
                <Label>Enable Quality Gates</Label>
                <p className="text-xs text-muted-foreground">
                  Run compile checks, test coverage, code quality, and security scans
                </p>
              </div>
              <Switch
                checked={settings.execution.enableQualityGates}
                onCheckedChange={(enableQualityGates) =>
                  setSettings({ ...settings, execution: { ...settings.execution, enableQualityGates } })
                }
              />
            </div>
          </TabsContent>

          {/* Model Router Configuration */}
          <TabsContent value="model" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Primary Provider</Label>
              <Select
                value={settings.modelRouter.primaryProvider}
                onValueChange={(value: AdvancedSettings['modelRouter']['primaryProvider']) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, primaryProvider: value } })
                }
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic - Highest quality</SelectItem>
                  <SelectItem value="openrouter">OpenRouter - 99% cost savings</SelectItem>
                  <SelectItem value="gemini">Gemini - Optimized for speed</SelectItem>
                  <SelectItem value="local">Local - Privacy-focused (ONNX)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="routingStrategy">Routing Strategy</Label>
              <Select
                value={settings.modelRouter.strategy}
                onValueChange={(value: AdvancedSettings['modelRouter']['strategy']) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, strategy: value } })
                }
              >
                <SelectTrigger id="routingStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost">Cost - Prefer cheapest models</SelectItem>
                  <SelectItem value="speed">Speed - Prefer fastest models</SelectItem>
                  <SelectItem value="quality">Quality - Prefer highest quality</SelectItem>
                  <SelectItem value="privacy">Privacy - Use local models only</SelectItem>
                  <SelectItem value="balanced">Balanced - Optimize all factors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCost">Max Cost Per Request ($): {settings.modelRouter.maxCostPerRequest.toFixed(2)}</Label>
              <Slider
                id="maxCost"
                min={0.01}
                max={5.0}
                step={0.01}
                value={[settings.modelRouter.maxCostPerRequest]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, maxCostPerRequest: value } })
                }
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/30">
              <div className="space-y-0.5">
                <Label>Enable Fallback</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically fallback to alternative providers on failure
                </p>
              </div>
              <Switch
                checked={settings.modelRouter.enableFallback}
                onCheckedChange={(enableFallback) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, enableFallback } })
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
