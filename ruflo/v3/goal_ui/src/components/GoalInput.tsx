import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Target, Sparkles, Settings, TrendingUp, Building2, Heart, GraduationCap, Code, Cpu, Brain, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GoalInputProps {
  onSubmit: (goal: string) => void;
  isPlanning: boolean;
  onAdvancedSettings?: () => void;
  onConfigUpdate?: (config: any) => void;
}

export const GoalInput = ({ onSubmit, isPlanning, onAdvancedSettings, onConfigUpdate }: GoalInputProps) => {
  const [goal, setGoal] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim()) {
      onSubmit(goal.trim());
    }
  };

  const categoryToPresetMap: Record<string, string> = {
    'finance': 'market-trends',
    'business': 'startup-validation',
    'marketing': 'competitive-analysis',
    'medical': 'medical-clinical',
    'education': 'academic-deep',
    'coding': 'technical-feasibility',
    'technical': 'technical-feasibility',
    'ai-ml': 'technical-feasibility',
  };

  const categories = [
    { id: 'finance', label: 'Finance', icon: TrendingUp, color: '#10b981' },
    { id: 'business', label: 'Business', icon: Building2, color: '#3b82f6' },
    { id: 'marketing', label: 'Marketing', icon: Megaphone, color: '#f97316' },
    { id: 'medical', label: 'Medical', icon: Heart, color: '#ef4444' },
    { id: 'education', label: 'Education', icon: GraduationCap, color: '#f59e0b' },
    { id: 'coding', label: 'Coding', icon: Code, color: '#8b5cf6' },
    { id: 'technical', label: 'Technical', icon: Cpu, color: '#06b6d4' },
    { id: 'ai-ml', label: 'AI & ML', icon: Brain, color: '#ec4899' },
  ];

  const generateGoals = async (category: string) => {
    setIsGenerating(true);
    try {
      // Generate goal and optimize config in parallel
      const [goalResult, configResult] = await Promise.all([
        supabase.functions.invoke('generate-research-goal', {
          body: { category }
        }),
        supabase.functions.invoke('optimize-research-config', {
          body: { 
            preset: categoryToPresetMap[category] || 'academic-deep',
            currentGoal: '' 
          }
        })
      ]);

      if (goalResult.error) throw goalResult.error;

      if (goalResult.data?.goals && goalResult.data.goals.length > 0) {
        // Set the first generated goal
        setGoal(goalResult.data.goals[0]);
        
        // Update config if available and callback provided
        if (configResult.data?.config && onConfigUpdate) {
          onConfigUpdate(configResult.data.config);
        }
        
        toast({
          title: "Goal & Settings Optimized",
          description: `Generated research goal and optimized settings for ${category}`,
        });
      }
    } catch (error) {
      console.error('Error generating goals:', error);
      toast({
        title: "Generation Failed",
        description: "Could not generate research goals. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground">Define Research Objective</h2>
        </div>
        {onAdvancedSettings && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAdvancedSettings}
            disabled={isPlanning}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Advanced</span>
          </Button>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Enter your research goal or objective..."
            className="min-h-[80px] sm:min-h-[100px] resize-none bg-background border-border text-foreground text-sm"
            disabled={isPlanning}
          />
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
            The GOAP system will analyze your objective and plan the optimal research workflow
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-foreground">AI-Generate by Category:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => generateGoals(cat.id)}
                disabled={isPlanning || isGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all text-xs",
                  "border border-border hover:border-primary/50",
                  "bg-card hover:bg-muted",
                  (isPlanning || isGenerating) && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  borderColor: isGenerating ? cat.color : undefined,
                }}
              >
                <cat.icon className="w-3 h-3" style={{ color: cat.color }} />
                <span className="text-foreground">{cat.label}</span>
              </button>
            ))}
          </div>
          {isGenerating && (
            <p className="text-xs text-primary flex items-center gap-1.5 mt-2">
              <Sparkles className="w-3 h-3 animate-spin" />
              Generating research goals...
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={!goal.trim() || isPlanning}
          className="w-full text-sm"
        >
          {isPlanning ? (
            <>
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
              <span className="text-xs sm:text-sm">Planning Research Workflow...</span>
            </>
          ) : (
            <>
              <Target className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              <span className="text-xs sm:text-sm">Generate Research Plan</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
