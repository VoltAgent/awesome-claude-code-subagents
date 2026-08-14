import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowRight } from "lucide-react";

export const CommunicationLog = () => {
  const messages = [
    {
      id: 1,
      from: "Architecture",
      to: "Implementation",
      message: "Database schema design completed. Ready for implementation.",
      timestamp: "2m ago",
      type: "info",
    },
    {
      id: 2,
      from: "Implementation",
      to: "Testing",
      message: "Auth module implemented. Please write unit tests.",
      timestamp: "1m ago",
      type: "request",
    },
    {
      id: 3,
      from: "Testing",
      to: "Code Review",
      message: "Test coverage at 85%. Ready for review.",
      timestamp: "30s ago",
      type: "success",
    },
    {
      id: 4,
      from: "Code Review",
      to: "Implementation",
      message: "Security concern found in auth middleware. Please fix.",
      timestamp: "10s ago",
      type: "warning",
    },
  ];

  const typeColors = {
    info: "bg-blue-500/20 text-blue-500",
    request: "bg-purple-500/20 text-purple-500",
    success: "bg-green-500/20 text-green-500",
    warning: "bg-yellow-500/20 text-yellow-500",
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Inter-Agent Communication
        </CardTitle>
        <CardDescription>Real-time message exchange between agents</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {msg.from}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs">
                    {msg.to}
                  </Badge>
                  <Badge className={`ml-auto text-xs ${typeColors[msg.type as keyof typeof typeColors]}`}>
                    {msg.type}
                  </Badge>
                </div>
                <p className="text-sm">{msg.message}</p>
                <p className="text-xs text-muted-foreground mt-2">{msg.timestamp}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
