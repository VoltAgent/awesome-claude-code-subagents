import { LucideIcon, ChevronRight, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export type StepStatus = "pending" | "active" | "completed" | "error";

interface DataItem {
  text: string;
  icon?: LucideIcon;
  details?: {
    objective?: string;
    sources?: string[];
    citations?: string[];
    agents?: string[];
    preconditions?: string[];
    effects?: string[];
    source?: string;
    confidence?: number;
    timestamp?: string;
  };
}

interface AgentStepProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  delay?: number;
  data?: DataItem[];
  metrics?: { label: string; value: string }[];
  primaryColor?: string;
  accentColor?: string;
  cardBackgroundColor?: string;
  cardBorderColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  successColor?: string;
  borderRadius?: string;
  animationSpeed?: string;
  compactMode?: boolean;
}

export const AgentStep = ({
  title,
  description,
  icon: Icon,
  status,
  delay = 0,
  data = [],
  metrics = [],
  primaryColor = "#6b7280",
  accentColor = "#22c55e",
  cardBackgroundColor = "#262626",
  cardBorderColor = "#404040",
  textColor = "#ffffff",
  secondaryTextColor = "#a3a3a3",
  successColor = "#22c55e",
  borderRadius = "0.5rem",
  animationSpeed = "normal",
  compactMode = false,
}: AgentStepProps) => {
  const [loadingItems, setLoadingItems] = useState<Set<number>>(new Set());
  const [completedItems, setCompletedItems] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (status === "active" && data.length > 0) {
      // Reset states when step becomes active
      setLoadingItems(new Set());
      setCompletedItems(new Set());
      
      // Simulate loading each item
      data.forEach((_, idx) => {
        setTimeout(() => {
          setLoadingItems(prev => new Set([...prev, idx]));
          
          // Complete item after 800ms
          setTimeout(() => {
            setLoadingItems(prev => {
              const next = new Set(prev);
              next.delete(idx);
              return next;
            });
            setCompletedItems(prev => new Set([...prev, idx]));
          }, 800);
        }, idx * 150);
      });
    } else if (status === "completed") {
      // All items completed
      setCompletedItems(new Set(data.map((_, idx) => idx)));
      setLoadingItems(new Set());
    }
  }, [status, data.length]);

  const animationDuration = animationSpeed === "fast" ? "250ms" : animationSpeed === "slow" ? "750ms" : "500ms";
  const padding = compactMode ? "0.75rem" : "1.25rem";

  return (
    <div
      className={cn(
        "relative group animate-slide-up opacity-0",
        "border bg-card",
        "transition-all",
        status === "pending" && "border-border",
      )}
      style={{ 
        animationDelay: `${delay}ms`, 
        animationFillMode: "forwards",
        borderColor: status === "active" ? `${primaryColor}80` : status === "completed" ? `${successColor}4d` : cardBorderColor,
        backgroundColor: status === "completed" ? `${successColor}0d` : cardBackgroundColor,
        boxShadow: status === "active" ? `0 4px 12px ${primaryColor}33` : undefined,
        borderRadius,
        padding,
        transitionDuration: animationDuration,
      }}
    >
      {/* Status indicator */}
      <div className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2">
        <div
          className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border-3 border-background transition-all duration-500"
          style={{
            backgroundColor: status === "pending" ? cardBorderColor : status === "active" ? primaryColor : status === "completed" ? successColor : cardBorderColor,
            animation: status === "active" ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : undefined,
          }}
        />
      </div>

      <div className="flex items-start gap-2 sm:gap-4">
        {/* Icon */}
        <div
          className="p-1.5 sm:p-2.5 rounded-md transition-all duration-500 flex-shrink-0"
          style={{
            backgroundColor: status === "pending" ? `${cardBorderColor}40` : status === "active" ? `${primaryColor}1a` : status === "completed" ? `${successColor}33` : `${cardBorderColor}40`,
            color: status === "pending" ? secondaryTextColor : status === "active" ? primaryColor : status === "completed" ? successColor : secondaryTextColor,
          }}
        >
          {status === "active" ? (
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" style={{ color: primaryColor }} />
          ) : (
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 
            className="font-medium mb-1" 
            style={{ fontSize: compactMode ? "0.875rem" : "1rem", color: textColor }}
          >
            {title}
          </h3>
          <p 
            className="text-sm" 
            style={{ color: secondaryTextColor, fontSize: compactMode ? "0.75rem" : "0.875rem" }}
          >
            {description}
          </p>

          {/* Progress indicator for active state */}
          {status === "active" && (
            <div className="mt-2.5 h-0.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-1000 ease-out"
                style={{
                  width: `${(completedItems.size / data.length) * 100}%`,
                  backgroundColor: `${primaryColor}99`,
                }}
              />
            </div>
          )}

          {/* Data display for active/completed states */}
          {(status === "active" || status === "completed") && data.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {data.map((item, idx) => {
                const ItemIcon = item.icon || ChevronRight;
                const isLoading = loadingItems.has(idx);
                const isCompleted = completedItems.has(idx);
                const isExpanded = expandedItems.has(idx);
                const hasDetails = !!item.details;
                
                return (
                  <div key={idx} className="space-y-1">
                    <div
                      onClick={() => {
                        if (hasDetails && isCompleted) {
                          setExpandedItems(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        "text-xs flex items-center gap-1.5 transition-all duration-500",
                        "opacity-0 -translate-x-4",
                        "animate-fade-in",
                        hasDetails && isCompleted && "cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1 py-0.5"
                      )}
                      style={{ 
                        animationDelay: `${idx * 150}ms`, 
                        animationFillMode: "forwards",
                        transform: isCompleted ? 'translateX(0) scale(1.05)' : isLoading ? 'translateX(0) scale(1.02)' : 'translateX(0)',
                        color: isCompleted ? successColor : isLoading ? primaryColor : secondaryTextColor,
                      }}
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" style={{ color: primaryColor }} />
                      ) : (
                        <ItemIcon 
                          className="w-3 h-3 flex-shrink-0 transition-all duration-300"
                            style={{
                            animation: isCompleted ? "bounce 0.5s ease-in-out 2" : undefined,
                            color: isCompleted ? successColor : undefined,
                          }}
                        />
                      )}
                      <span 
                        className={cn(
                          "transition-all duration-300 flex-1",
                          isLoading && "animate-pulse"
                        )}
                        style={{ fontWeight: isCompleted ? 500 : undefined }}
                      >
                        {item.text}
                      </span>
                      {isCompleted && (
                        <>
                          <span className="text-[10px]" style={{ color: successColor }}>✓</span>
                          {hasDetails && (
                            <ChevronDown className={cn(
                              "w-3 h-3 transition-transform duration-200",
                              isExpanded && "rotate-180"
                            )} style={{ color: successColor }} />
                          )}
                        </>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {hasDetails && isCompleted && (
                      <div 
                        className={cn(
                          "ml-5 pl-3 border-l space-y-2 text-[11px] overflow-hidden transition-all duration-300 ease-in-out origin-top",
                          isExpanded ? "max-h-96 opacity-100 scale-y-100 mt-1.5" : "max-h-0 opacity-0 scale-y-0"
                        )}
                        style={{ borderColor: `${successColor}4d` }}
                      >
                        {item.details.objective && (
                          <div className="animate-fade-in" style={{ animationDelay: "50ms" }}>
                            <span className="text-muted-foreground font-medium">Objective:</span>
                            <p className="text-foreground/80 mt-0.5">{item.details.objective}</p>
                          </div>
                        )}
                        {item.details.preconditions && item.details.preconditions.length > 0 && (
                          <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
                            <span className="text-muted-foreground font-medium">Preconditions:</span>
                            <ul className="text-foreground/80 mt-0.5 space-y-0.5">
                              {item.details.preconditions.map((p, i) => (
                                <li key={i}>• {p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.details.effects && item.details.effects.length > 0 && (
                          <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
                            <span className="text-muted-foreground font-medium">Effects:</span>
                            <ul className="text-foreground/80 mt-0.5 space-y-0.5">
                              {item.details.effects.map((e, i) => (
                                <li key={i}>• {e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.details.agents && item.details.agents.length > 0 && (
                          <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
                            <span className="text-muted-foreground font-medium">Agents:</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {item.details.agents.map((a, i) => (
                                <span key={i} className="bg-muted/50 px-1.5 py-0.5 rounded text-foreground/80">{a}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.details.sources && item.details.sources.length > 0 && (
                          <div className="animate-fade-in" style={{ animationDelay: "250ms" }}>
                            <span className="text-muted-foreground font-medium">Sources:</span>
                            <ul className="text-foreground/80 mt-0.5 space-y-0.5">
                              {item.details.sources.map((s, i) => (
                                <li key={i}>• {s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.details.citations && item.details.citations.length > 0 && (
                          <div className="animate-fade-in" style={{ animationDelay: "300ms" }}>
                            <span className="text-muted-foreground font-medium">Citations:</span>
                            <ul className="text-foreground/80 mt-0.5 space-y-0.5">
                              {item.details.citations.map((c, i) => (
                                <li key={i} className="italic">"{c}"</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Metrics for completed state */}
          {status === "completed" && metrics.length > 0 && (
            <div className="mt-3 flex gap-4 animate-fade-in">
              {metrics.map((metric, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">{metric.label}:</span>
                  <span className="text-foreground font-medium">{metric.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div
          className="text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded transition-all duration-500 flex-shrink-0"
          style={{
            backgroundColor: status === "pending" ? `${cardBorderColor}40` : status === "active" ? `${primaryColor}1a` : status === "completed" ? `${successColor}33` : `${cardBorderColor}40`,
            color: status === "pending" ? secondaryTextColor : status === "active" ? primaryColor : status === "completed" ? successColor : secondaryTextColor,
          }}
        >
          {status === "pending" && "Pending"}
          {status === "active" && "Researching..."}
          {status === "completed" && "Complete"}
          {status === "error" && "Error"}
        </div>
      </div>
    </div>
  );
};
