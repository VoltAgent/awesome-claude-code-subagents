import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Target, TrendingUp, ArrowRight, Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface StateAssessmentCardProps {
  currentState: Record<string, boolean | string | number>;
  goalState: Record<string, boolean | string | number>;
  stateGaps: string[];
  primaryColor: string;
  accentColor: string;
}

export const StateAssessmentCard = ({
  currentState,
  goalState,
  stateGaps,
  primaryColor,
  accentColor,
}: StateAssessmentCardProps) => {
  const [visibleStates, setVisibleStates] = useState<string[]>([]);
  const [animatingState, setAnimatingState] = useState<string | null>(null);
  
  const currentStateEntries = Object.entries(currentState);
  const goalStateEntries = Object.entries(goalState);

  // Calculate progress percentage
  const completedCount = currentStateEntries.filter(([_, value]) => value === true).length;
  const totalCount = goalStateEntries.length;
  const progressPercentage = Math.round((completedCount / totalCount) * 100);

  // Animate state entries appearing one by one
  useEffect(() => {
    const allKeys = currentStateEntries.map(([key]) => key);
    setVisibleStates([]);
    
    allKeys.forEach((key, index) => {
      setTimeout(() => {
        setVisibleStates(prev => [...prev, key]);
        setAnimatingState(key);
        setTimeout(() => setAnimatingState(null), 600);
      }, index * 150);
    });
  }, [JSON.stringify(currentState)]);

  // Check if state has changed (for highlighting)
  const hasStateChanged = (key: string) => {
    return currentState[key] === true && animatingState === key;
  };

  return (
    <Card className="border-2 overflow-hidden relative" style={{ borderColor: `${primaryColor}40` }}>
      {/* Animated background gradient */}
      <div 
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
        }}
      />
      
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 animate-pulse" style={{ color: primaryColor }} />
              GOAP State Assessment
            </CardTitle>
            <CardDescription>
              Real-time state progression tracking
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: primaryColor }}>
              {progressPercentage}%
            </div>
            <div className="text-xs text-muted-foreground">
              {completedCount}/{totalCount} complete
            </div>
          </div>
        </div>
        
        {/* Overall Progress Bar */}
        <div className="mt-4">
          <Progress 
            value={progressPercentage} 
            className="h-2"
            style={{
              backgroundColor: `${primaryColor}20`,
            }}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 relative">
        {/* State Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current State */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Circle className="w-4 h-4" style={{ color: primaryColor }} />
              <h4 className="text-sm font-semibold">System State</h4>
              <Badge variant="outline" className="ml-auto text-xs">
                Current
              </Badge>
            </div>
            <div className="space-y-1">
              {currentStateEntries.map(([key, value], index) => {
                const isVisible = visibleStates.includes(key);
                const isAnimating = hasStateChanged(key);
                const isTrue = value === true;
                
                return (
                  <div
                    key={key}
                    className={`
                      flex items-center gap-3 p-2 rounded-lg border transition-all duration-500
                      ${!isVisible ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
                      ${isAnimating ? 'ring-2 scale-105' : 'scale-100'}
                      ${isTrue ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/50 border-border'}
                    `}
                    style={{
                      animationDelay: `${index * 100}ms`,
                      ...(isAnimating && { ringColor: primaryColor }),
                    }}
                  >
                    <div className={`
                      flex items-center justify-center w-6 h-6 rounded-full transition-all duration-500
                      ${isTrue ? 'bg-green-500' : 'bg-muted'}
                    `}>
                      {isTrue ? (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <span className="font-mono text-xs font-medium">
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                    
                    <Badge 
                      variant={isTrue ? "default" : "secondary"} 
                      className={`text-xs transition-all duration-300 ${isAnimating ? 'animate-pulse' : ''}`}
                    >
                      {String(value)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Goal State */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b">
              <CheckCircle2 className="w-4 h-4" style={{ color: accentColor }} />
              <h4 className="text-sm font-semibold" style={{ color: accentColor }}>
                Goal State
              </h4>
              <Badge variant="outline" className="ml-auto text-xs" style={{ borderColor: accentColor, color: accentColor }}>
                Target
              </Badge>
            </div>
            <div className="space-y-1">
              {goalStateEntries.map(([key, value], index) => {
                const isVisible = visibleStates.includes(key);
                const isAchieved = currentState[key] === value;
                
                return (
                  <div
                    key={key}
                    className={`
                      flex items-center gap-3 p-2 rounded-lg transition-all duration-500 border
                      ${!isVisible ? 'opacity-0 -translate-x-4' : 'opacity-100 translate-x-0'}
                      ${isAchieved ? 'bg-green-500/10 border-green-500/30' : ''}
                    `}
                    style={{
                      backgroundColor: isAchieved ? undefined : `${accentColor}10`,
                      borderColor: isAchieved ? undefined : `${accentColor}30`,
                      animationDelay: `${index * 100}ms`,
                    }}
                  >
                    <div 
                      className={`
                        flex items-center justify-center w-6 h-6 rounded-full transition-all duration-500
                        ${isAchieved ? 'bg-green-500' : ''}
                      `}
                      style={{
                        backgroundColor: isAchieved ? undefined : accentColor,
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    
                    <div className="flex-1">
                      <span className="font-mono text-xs font-medium">
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                    
                    <Badge 
                      className="text-xs"
                      style={{ 
                        backgroundColor: isAchieved ? undefined : accentColor, 
                        color: 'white' 
                      }}
                    >
                      {String(value)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* State Transitions */}
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-4 h-4" style={{ color: primaryColor }} />
            <h4 className="text-sm font-semibold">State Transitions</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {currentStateEntries.slice(0, 3).map(([key, currentValue], index) => {
              const goalValue = goalState[key];
              const isTransitioning = currentValue !== goalValue;
              const isVisible = visibleStates.includes(key);
              
              return (
                <div
                  key={key}
                  className={`
                    p-2 rounded-lg border bg-card transition-all duration-500
                    ${!isVisible ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}
                  `}
                  style={{ animationDelay: `${(index + currentStateEntries.length) * 100}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-medium">
                      {key.replace(/_/g, ' ')}
                    </span>
                    {isTransitioning && (
                      <Zap className="w-3 h-3 text-yellow-500 animate-pulse" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {String(currentValue)}
                    </Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <Badge 
                      className="text-xs"
                      style={{ backgroundColor: accentColor, color: 'white' }}
                    >
                      {String(goalValue)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* State Gaps - Animated List */}
        {stateGaps.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: primaryColor }} />
              <h4 className="text-sm font-semibold">Action Plan</h4>
              <Badge variant="outline" className="ml-auto text-xs">
                {stateGaps.length} steps remaining
              </Badge>
            </div>
            <div className="space-y-2">
              {stateGaps.map((gap, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-300 animate-fade-in group"
                  style={{ 
                    animationDelay: `${(idx + currentStateEntries.length * 2) * 100}ms`,
                    animationFillMode: 'forwards',
                    opacity: 0,
                  }}
                >
                  <div 
                    className="flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs transition-all duration-300 group-hover:scale-110"
                    style={{ 
                      backgroundColor: `${primaryColor}20`,
                      color: primaryColor,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed">{gap}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
