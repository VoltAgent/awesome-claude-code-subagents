import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch, Clock } from 'lucide-react';

interface Action {
  id: string;
  name: string;
  cost: number;
  description?: string;
}

interface PlanVisualizationProps {
  actions: Action[];
  currentActionId?: string;
  completedActionIds: string[];
  onActionClick?: (action: Action) => void;
}

export function PlanVisualization({
  actions,
  currentActionId,
  completedActionIds,
  onActionClick
}: PlanVisualizationProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'timeline'>('graph');

  const { nodes, edges } = useMemo(() => {
    return convertPlanToGraph(actions, currentActionId, completedActionIds);
  }, [actions, currentActionId, completedActionIds]);

  const totalCost = actions.reduce((sum, a) => sum + a.cost, 0);

  return (
    <Card className="col-span-full border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-500" />
            Execution Plan
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {actions.length} Actions
            </Badge>
            <Badge variant="outline">
              Cost: {totalCost}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              Est. {Math.ceil(totalCost * 0.5)}m
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="graph">Graph View</TabsTrigger>
            <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="h-[500px] border rounded-lg">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(event, node) => {
                const action = actions.find(a => a.id === node.id);
                if (action && onActionClick) {
                  onActionClick(action);
                }
              }}
              fitView
              className="bg-muted/30 rounded-lg"
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-2">
            {actions.map((action, index) => {
              const isCompleted = completedActionIds.includes(action.id);
              const isCurrent = action.id === currentActionId;
              
              return (
                <div
                  key={action.id}
                  className={`
                    p-4 rounded-lg border transition-all cursor-pointer
                    ${isCurrent ? 'bg-purple-500/10 border-purple-500/50' : 'bg-card hover:bg-muted/50'}
                    ${isCompleted ? 'opacity-60' : ''}
                  `}
                  onClick={() => onActionClick?.(action)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-purple-500 text-white animate-pulse' : 'bg-muted text-muted-foreground'}
                      `}>
                        {isCompleted ? '✓' : index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{action.name}</div>
                        {action.description && (
                          <div className="text-sm text-muted-foreground">{action.description}</div>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline">Cost: {action.cost}</Badge>
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function convertPlanToGraph(
  actions: Action[],
  currentActionId?: string,
  completedActionIds: string[] = []
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = actions.map((action, index) => {
    const isCompleted = completedActionIds.includes(action.id);
    const isCurrent = action.id === currentActionId;

    return {
      id: action.id,
      position: calculateNodePosition(index, actions.length),
      data: {
        label: (
          <div className="text-center">
            <div className="font-semibold text-sm">{action.name}</div>
            <div className="text-xs text-muted-foreground">Cost: {action.cost}</div>
          </div>
        )
      },
      style: {
        background: isCompleted
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : isCurrent
          ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
          : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        color: 'white',
        border: isCurrent ? '2px solid #a855f7' : '1px solid transparent',
        borderRadius: '8px',
        padding: '12px',
        width: 180,
        boxShadow: isCurrent ? '0 0 20px rgba(168, 85, 247, 0.5)' : undefined
      }
    };
  });

  const edges: Edge[] = [];
  for (let i = 0; i < actions.length - 1; i++) {
    const isCompleted = completedActionIds.includes(actions[i].id);
    edges.push({
      id: `${actions[i].id}-${actions[i + 1].id}`,
      source: actions[i].id,
      target: actions[i + 1].id,
      animated: actions[i + 1].id === currentActionId,
      style: {
        stroke: isCompleted ? '#10b981' : '#64748b',
        strokeWidth: 2
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isCompleted ? '#10b981' : '#64748b'
      }
    });
  }

  return { nodes, edges };
}

function calculateNodePosition(index: number, total: number): { x: number; y: number } {
  const nodesPerRow = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / nodesPerRow);
  const col = index % nodesPerRow;

  return {
    x: col * 250,
    y: row * 150
  };
}