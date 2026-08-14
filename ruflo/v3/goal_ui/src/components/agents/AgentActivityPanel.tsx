import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Cpu, HardDrive, Zap, Clock } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  currentTask?: string;
}

interface AgentMetrics {
  tasksCompleted: number;
  tasksActive: number;
  tasksFailed: number;
  avgCompletionTime: number;
  totalTokens: number;
  uptime: number;
}

interface AgentActivityPanelProps {
  agents: Agent[];
  metrics: Map<string, AgentMetrics>;
}

export function AgentActivityPanel({ agents, metrics }: AgentActivityPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(
    agents[0] || null
  );

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          Agent Activity Monitor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedAgent?.id} onValueChange={(id) => {
          const agent = agents.find(a => a.id === id);
          if (agent) setSelectedAgent(agent);
        }}>
          <TabsList className="w-full grid grid-cols-3 lg:grid-cols-5 mb-4">
            {agents.map(agent => (
              <TabsTrigger key={agent.id} value={agent.id} className="gap-1 text-xs">
                <Bot className="w-3 h-3" />
                <span className="hidden sm:inline">{agent.name}</span>
                <Badge
                  variant={
                    agent.status === 'working'
                      ? 'default'
                      : agent.status === 'idle'
                      ? 'secondary'
                      : 'destructive'
                  }
                  className="ml-1 h-2 w-2 p-0 rounded-full"
                >
                  <span className="sr-only">{agent.status}</span>
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {agents.map(agent => {
            const agentMetrics = metrics.get(agent.id);

            return (
              <TabsContent key={agent.id} value={agent.id} className="space-y-4">
                {/* Agent Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Agent Type</div>
                    <Badge variant="outline" className="text-sm">{agent.type}</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                    <Badge
                      variant={
                        agent.status === 'working'
                          ? 'default'
                          : agent.status === 'idle'
                          ? 'secondary'
                          : 'destructive'
                      }
                      className="text-sm"
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </div>

                {/* Current Task */}
                {agent.currentTask && (
                  <div className="p-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg">
                    <div className="text-sm font-medium mb-1 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />
                      Current Task
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {agent.currentTask}
                    </div>
                  </div>
                )}

                {/* Metrics */}
                {agentMetrics && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="text-xs font-medium mb-1 text-muted-foreground">Tasks Completed</div>
                        <div className="text-2xl font-bold text-green-500">
                          {agentMetrics.tasksCompleted}
                        </div>
                      </div>
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <div className="text-xs font-medium mb-1 text-muted-foreground">Tasks Active</div>
                        <div className="text-2xl font-bold text-blue-500">
                          {agentMetrics.tasksActive}
                        </div>
                      </div>
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="text-xs font-medium mb-1 text-muted-foreground">Tasks Failed</div>
                        <div className="text-2xl font-bold text-red-500">
                          {agentMetrics.tasksFailed}
                        </div>
                      </div>
                      <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="text-xs font-medium mb-1 text-muted-foreground">Avg Time</div>
                        <div className="text-2xl font-bold text-purple-500">
                          {formatDuration(agentMetrics.avgCompletionTime)}
                        </div>
                      </div>
                    </div>

                    {/* Resource Usage */}
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                      <h5 className="text-sm font-semibold mb-2">Resource Usage</h5>
                      
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-1">
                            <Cpu className="w-4 h-4 text-blue-500" /> CPU Usage
                          </span>
                          <span className="font-mono">65%</span>
                        </div>
                        <Progress value={65} className="h-2" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-4 h-4 text-green-500" /> Memory Usage
                          </span>
                          <span className="font-mono">420 MB</span>
                        </div>
                        <Progress value={82} className="h-2" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-1">
                            <Zap className="w-4 h-4 text-yellow-500" /> Token Usage
                          </span>
                          <span className="font-mono">{agentMetrics.totalTokens.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Uptime
                          </span>
                          <span className="font-mono">{formatDuration(agentMetrics.uptime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}