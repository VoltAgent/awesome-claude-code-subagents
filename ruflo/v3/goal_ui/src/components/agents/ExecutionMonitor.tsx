import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Clock, Coins, Activity } from "lucide-react";

interface ExecutionMonitorProps {
  isRunning: boolean;
}

export const ExecutionMonitor = ({ isRunning }: ExecutionMonitorProps) => {
  const metrics = {
    parallelTasks: 3,
    apiTokensUsed: 12450,
    apiTokensLimit: 50000,
    elapsedTime: "2m 34s",
    estimatedCompletion: "8m 15s",
    throughput: "4.2 tasks/min",
  };

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Parallel Execution Monitor
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Status: {isRunning ? (
              <Badge variant="default" className="animate-pulse">Active</Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 p-4 rounded-lg border bg-card/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="w-4 h-4" />
                Parallel Tasks
              </div>
              <div className="text-2xl font-bold">{metrics.parallelTasks}</div>
            </div>

            <div className="space-y-2 p-4 rounded-lg border bg-card/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                Elapsed Time
              </div>
              <div className="text-2xl font-bold">{metrics.elapsedTime}</div>
            </div>

            <div className="space-y-2 p-4 rounded-lg border bg-card/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="w-4 h-4" />
                Throughput
              </div>
              <div className="text-2xl font-bold">{metrics.throughput}</div>
            </div>
          </div>

          {/* API Token Usage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                <span className="font-semibold">API Token Usage</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {metrics.apiTokensUsed.toLocaleString()} / {metrics.apiTokensLimit.toLocaleString()}
              </span>
            </div>
            <Progress 
              value={(metrics.apiTokensUsed / metrics.apiTokensLimit) * 100} 
              className="h-2"
            />
          </div>

          {/* Estimated Completion */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5">
            <span className="text-sm font-medium">Estimated Completion</span>
            <span className="text-sm font-mono text-primary">{metrics.estimatedCompletion}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
