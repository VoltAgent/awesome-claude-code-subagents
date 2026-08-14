import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Zap, Shield, RefreshCw } from "lucide-react";

interface GOAPConfigDisplayProps {
  executionMode: "focused" | "closed" | "open";
  enableReplanning: boolean;
  replanningTriggers: string[];
  costOptimization: boolean;
  parallelExecution: boolean;
  maxActionCost: number;
  primaryColor: string;
}

export const GOAPConfigDisplay = ({
  executionMode,
  enableReplanning,
  replanningTriggers,
  costOptimization,
  parallelExecution,
  maxActionCost,
  primaryColor,
}: GOAPConfigDisplayProps) => {
  const modeDescriptions = {
    focused: "Direct action execution with precondition checking",
    closed: "Single-domain planning with type safety",
    open: "Creative problem solving across all domains",
  };

  return (
    <Card className="border" style={{ borderColor: `${primaryColor}40` }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" style={{ color: primaryColor }} />
          GOAP Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          Active planning and execution settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Execution Mode</span>
            <Badge variant="outline" className="text-xs capitalize">
              {executionMode}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{modeDescriptions[executionMode]}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            {costOptimization ? (
              <Zap className="w-3 h-3 text-yellow-500" />
            ) : (
              <Zap className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">Cost Optimization</span>
          </div>
          <div className="flex items-center gap-2">
            {parallelExecution ? (
              <RefreshCw className="w-3 h-3 text-blue-500" />
            ) : (
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">Parallel Execution</span>
          </div>
          <div className="flex items-center gap-2">
            {enableReplanning ? (
              <Shield className="w-3 h-3 text-green-500" />
            ) : (
              <Shield className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">Replanning Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">Max Cost: {maxActionCost}</span>
          </div>
        </div>

        {enableReplanning && replanningTriggers.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <span className="text-xs font-medium">Active Triggers ({replanningTriggers.length})</span>
            <div className="flex flex-wrap gap-1">
              {replanningTriggers.map((trigger) => (
                <Badge key={trigger} variant="secondary" className="text-xs">
                  {trigger}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};