import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, ArrowRight } from "lucide-react";

export const DependencyGraph = () => {
  const dependencies = [
    { from: "Architecture", to: "Implementation", status: "complete" },
    { from: "Implementation", to: "Testing", status: "active" },
    { from: "Testing", to: "Code Review", status: "pending" },
    { from: "Code Review", to: "Documentation", status: "pending" },
    { from: "Documentation", to: "DevOps", status: "pending" },
  ];

  return (
    <Card className="border-2 border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-purple-500" />
          Task Dependencies
        </CardTitle>
        <CardDescription>Workflow execution order</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {dependencies.map((dep, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card/50"
            >
              <div className="flex-1 text-sm font-medium">{dep.from}</div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 text-sm font-medium">{dep.to}</div>
              <div
                className={`w-2 h-2 rounded-full ${
                  dep.status === "complete"
                    ? "bg-green-500"
                    : dep.status === "active"
                    ? "bg-blue-500 animate-pulse"
                    : "bg-muted"
                }`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
