import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface TaskBoardProps {
  swarmMode: string;
}

const tasks = [
  { id: 1, title: "Design database schema", agent: "Architecture", status: "todo", priority: "high" },
  { id: 2, title: "Implement user authentication", agent: "Implementation", status: "in-progress", priority: "high" },
  { id: 3, title: "Write unit tests for auth", agent: "Testing", status: "todo", priority: "medium" },
  { id: 4, title: "Review authentication code", agent: "Code Review", status: "blocked", priority: "high" },
  { id: 5, title: "Document API endpoints", agent: "Documentation", status: "todo", priority: "low" },
  { id: 6, title: "Setup CI/CD pipeline", agent: "DevOps", status: "in-progress", priority: "medium" },
];

const columns = [
  { id: "todo", title: "To Do", icon: Clock },
  { id: "in-progress", title: "In Progress", icon: AlertCircle },
  { id: "blocked", title: "Blocked", icon: AlertCircle },
  { id: "done", title: "Done", icon: CheckCircle2 },
];

export const TaskBoard = ({ swarmMode }: TaskBoardProps) => {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Task Assignment Board</CardTitle>
          <CardDescription>Drag and drop tasks to assign agents</CardDescription>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span>Mode:</span>
            <Badge variant="outline">{swarmMode}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {columns.map((column) => {
              const Icon = column.icon;
              const columnTasks = tasks.filter(t => t.status === column.id);
              
              return (
                <div key={column.id} className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon className="w-4 h-4" />
                    {column.title}
                    <Badge variant="secondary" className="ml-auto">
                      {columnTasks.length}
                    </Badge>
                  </div>
                  
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                      {columnTasks.map((task) => (
                        <Card key={task.id} className="border cursor-move hover:border-primary/50 transition-all">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <GripVertical className="w-4 h-4 text-muted-foreground mt-1" />
                              <div className="flex-1 space-y-2">
                                <p className="text-sm font-medium">{task.title}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {task.agent}
                                  </Badge>
                                  <Badge 
                                    variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {task.priority}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
