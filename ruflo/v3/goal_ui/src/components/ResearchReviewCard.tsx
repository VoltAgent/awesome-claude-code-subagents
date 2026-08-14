import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Edit3, Target, GitBranch, Code, TestTube, FileText } from "lucide-react";
import { useState } from "react";

interface ResearchReviewCardProps {
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  goal: string;
}

export const ResearchReviewCard = ({ onApprove, onRevise, goal }: ResearchReviewCardProps) => {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const handleRevise = () => {
    if (showFeedback) {
      onRevise(feedback);
      setFeedback("");
      setShowFeedback(false);
    } else {
      setShowFeedback(true);
    }
  };

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-background to-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              Research Complete - Ready for Review
            </CardTitle>
            <CardDescription className="text-base">
              Review the research findings and execution plan before launching development
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Goal Summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="w-4 h-4" />
            Project Goal
          </div>
          <p className="text-foreground pl-6">{goal}</p>
        </div>

        {/* Research Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-medium">Goal Assessment</span>
            </div>
            <Badge variant="secondary" className="w-fit">Completed</Badge>
            <p className="text-sm text-muted-foreground">Requirements analyzed, agents identified</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-purple-500" />
              <span className="font-medium">Architecture</span>
            </div>
            <Badge variant="secondary" className="w-fit">Completed</Badge>
            <p className="text-sm text-muted-foreground">System design, API contracts planned</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              <span className="font-medium">Implementation</span>
            </div>
            <Badge variant="secondary" className="w-fit">Ready</Badge>
            <p className="text-sm text-muted-foreground">42 files, 1,247 LOC planned</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-green-500" />
              <span className="font-medium">Testing</span>
            </div>
            <Badge variant="secondary" className="w-fit">Ready</Badge>
            <p className="text-sm text-muted-foreground">124 tests, 87% coverage target</p>
          </div>
        </div>

        {/* Execution Plan Summary */}
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-muted">
          <h4 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Execution Plan Summary
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Phases:</span>
              <p className="font-medium">5 phases</p>
            </div>
            <div>
              <span className="text-muted-foreground">Estimated Duration:</span>
              <p className="font-medium">~40 seconds</p>
            </div>
            <div>
              <span className="text-muted-foreground">Agents Required:</span>
              <p className="font-medium">6 agents</p>
            </div>
            <div>
              <span className="text-muted-foreground">Complexity:</span>
              <p className="font-medium">Medium</p>
            </div>
          </div>
        </div>

        {/* Revision Feedback */}
        {showFeedback && (
          <div className="space-y-2 animate-fade-in">
            <label className="text-sm font-medium">Revision Feedback (Optional)</label>
            <Textarea
              placeholder="Describe what should be changed in the research or plan..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={onApprove}
            size="lg"
            className="flex-1 gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            <CheckCircle2 className="w-5 h-5" />
            Approve & Launch Development
          </Button>
          <Button
            onClick={handleRevise}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Edit3 className="w-5 h-5" />
            {showFeedback ? "Submit Revision Request" : "Request Revision"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
