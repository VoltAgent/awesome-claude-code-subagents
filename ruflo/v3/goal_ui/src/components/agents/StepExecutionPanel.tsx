import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Pause, SkipForward, RotateCcw, Zap, Bot, CheckCircle2, ArrowRight } from 'lucide-react';

interface StepExecutionPanelProps {
  currentAction: {
    name: string;
    description?: string;
    cost: number;
    preconditions?: Record<string, boolean | string>;
    effects?: Record<string, boolean | string>;
  };
  assignedAgent: {
    name: string;
    type: string;
    status: string;
  };
  progress: number;
  logs: string[];
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  onRetry?: () => void;
  isPaused: boolean;
}

export function StepExecutionPanel({
  currentAction,
  assignedAgent,
  progress,
  logs,
  onPause,
  onResume,
  onSkip,
  onRetry,
  isPaused
}: StepExecutionPanelProps) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500 animate-pulse" />
            Current Step
          </CardTitle>
          <div className="flex gap-2">
            {isPaused ? (
              <Button size="sm" variant="outline" onClick={onResume}>
                <Play className="w-4 h-4 mr-1" /> Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onPause}>
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onSkip}>
              <SkipForward className="w-4 h-4 mr-1" /> Skip
            </Button>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw className="w-4 h-4 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Info */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-lg">{currentAction.name}</h4>
            <Badge variant="outline">Cost: {currentAction.cost}</Badge>
          </div>
          {currentAction.description && (
            <p className="text-sm text-muted-foreground">
              {currentAction.description}
            </p>
          )}
        </div>

        {/* Assigned Agent */}
        <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20">
          <Bot className="w-5 h-5 text-purple-500" />
          <div className="flex-1">
            <div className="text-sm font-medium">{assignedAgent.name}</div>
            <div className="text-xs text-muted-foreground">
              {assignedAgent.type}
            </div>
          </div>
          <Badge
            variant={
              assignedAgent.status === 'working'
                ? 'default'
                : assignedAgent.status === 'blocked'
                ? 'destructive'
                : 'secondary'
            }
          >
            {assignedAgent.status}
          </Badge>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="font-bold text-lg" style={{ color: '#a855f7' }}>{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="text-xs text-muted-foreground">
            {getProgressLabel(progress)}
          </div>
        </div>

        {/* Preconditions & Effects */}
        {(currentAction.preconditions || currentAction.effects) && (
          <div className="grid grid-cols-2 gap-4">
            {currentAction.preconditions && (
              <div>
                <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Preconditions
                </h5>
                <div className="space-y-1">
                  {Object.entries(currentAction.preconditions).map(([key, value]) => (
                    <div
                      key={key}
                      className="text-xs flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded"
                    >
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="font-mono">{key}: {String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentAction.effects && (
              <div>
                <h5 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <ArrowRight className="w-4 h-4 text-blue-500" />
                  Effects
                </h5>
                <div className="space-y-1">
                  {Object.entries(currentAction.effects).map(([key, value]) => (
                    <div
                      key={key}
                      className="text-xs flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded"
                    >
                      <ArrowRight className="w-3 h-3 text-blue-500" />
                      <span className="font-mono">{key}: {String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Real-time Logs */}
        <div>
          <h5 className="text-sm font-semibold mb-2">Execution Log</h5>
          <ScrollArea className="h-[150px] rounded-md border bg-muted/30 p-3">
            <div className="space-y-1 font-mono text-xs">
              {logs.map((log, index) => (
                <div key={index} className="text-muted-foreground animate-fade-in">
                  <span className="text-purple-500">
                    [{new Date().toLocaleTimeString()}]
                  </span>{' '}
                  {log}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No logs yet...
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function getProgressLabel(progress: number): string {
  if (progress < 25) return 'Initializing...';
  if (progress < 50) return 'Processing...';
  if (progress < 75) return 'Executing...';
  if (progress < 100) return 'Finalizing...';
  return 'Complete!';
}