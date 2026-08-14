import { LucideIcon, ChevronRight, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export type StepStatus = "pending" | "active" | "completed" | "error";

interface DataItem {
  text: string;
  icon?: LucideIcon;
  details?: {
    objective?: string;
    files?: string[];
    agents?: string[];
    preconditions?: string[];
    effects?: string[];
    metrics?: { label: string; value: string }[];
  };
}

interface DevelopmentStepProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  delay?: number;
  data?: DataItem[];
  metrics?: { label: string; value: string }[];
}

export const DevelopmentStep = ({
  title,
  description,
  icon: Icon,
  status,
  delay = 0,
  data = [],
  metrics = [],
}: DevelopmentStepProps) => {
  const [loadingItems, setLoadingItems] = useState<Set<number>>(new Set());
  const [completedItems, setCompletedItems] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (status === "active" && data.length > 0) {
      setLoadingItems(new Set());
      setCompletedItems(new Set());
      
      data.forEach((_, idx) => {
        setTimeout(() => {
          setLoadingItems(prev => new Set([...prev, idx]));
          
          setTimeout(() => {
            setLoadingItems(prev => {
              const next = new Set(prev);
              next.delete(idx);
              return next;
            });
            setCompletedItems(prev => new Set([...prev, idx]));
          }, 1200);
        }, idx * 200);
      });
    } else if (status === "completed") {
      setCompletedItems(new Set(data.map((_, idx) => idx)));
      setLoadingItems(new Set());
    }
  }, [status, data.length]);

  return (
    <div
      className={cn(
        "relative group animate-slide-up opacity-0 border-l-4 rounded-r-lg overflow-hidden",
        "transition-all duration-500",
        status === "pending" && "border-l-border bg-card/50",
        status === "active" && "border-l-primary bg-primary/5 shadow-lg shadow-primary/20",
        status === "completed" && "border-l-green-500 bg-green-500/5"
      )}
      style={{ 
        animationDelay: `${delay}ms`, 
        animationFillMode: "forwards",
      }}
    >
      <div className="p-5">
        <div className="flex items-start gap-4 mb-4">
          {/* Icon with different styling */}
          <div
            className={cn(
              "p-3 rounded-xl transition-all duration-500 flex-shrink-0 shadow-md",
              status === "pending" && "bg-muted/50 text-muted-foreground",
              status === "active" && "bg-primary/20 text-primary ring-2 ring-primary/30",
              status === "completed" && "bg-green-500/20 text-green-500"
            )}
          >
            {status === "active" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Icon className="w-6 h-6" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-lg text-foreground">
                {title}
              </h3>
              <div
                className={cn(
                  "text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap",
                  status === "pending" && "bg-muted text-muted-foreground",
                  status === "active" && "bg-primary/20 text-primary animate-pulse",
                  status === "completed" && "bg-green-500/20 text-green-500"
                )}
              >
                {status === "pending" && "Queued"}
                {status === "active" && "Building..."}
                {status === "completed" && "Done"}
                {status === "error" && "Failed"}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {/* Progress bar for active state */}
        {status === "active" && (
          <div className="mb-4 h-1 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-out rounded-full"
              style={{
                width: `${(completedItems.size / data.length) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Task items with different styling */}
        {(status === "active" || status === "completed") && data.length > 0 && (
          <div className="space-y-2 pl-2">
            {data.map((item, idx) => {
              const ItemIcon = item.icon || ChevronRight;
              const isLoading = loadingItems.has(idx);
              const isCompleted = completedItems.has(idx);
              const isExpanded = expandedItems.has(idx);
              const hasDetails = !!item.details;
              
              return (
                <div key={idx} className="space-y-2">
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
                      "flex items-center gap-2 p-2 rounded-lg transition-all duration-500",
                      "opacity-0 animate-fade-in border",
                      isCompleted && "bg-green-500/5 border-green-500/20",
                      isLoading && "bg-primary/5 border-primary/20",
                      !isLoading && !isCompleted && "bg-muted/30 border-transparent",
                      hasDetails && isCompleted && "cursor-pointer hover:bg-green-500/10"
                    )}
                    style={{ 
                      animationDelay: `${idx * 200}ms`, 
                      animationFillMode: "forwards",
                    }}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-primary" />
                    ) : (
                      <ItemIcon 
                        className={cn(
                          "w-4 h-4 flex-shrink-0 transition-all duration-300",
                          isCompleted && "text-green-500"
                        )}
                      />
                    )}
                    <span 
                      className={cn(
                        "text-sm flex-1 transition-all duration-300",
                        isCompleted && "text-foreground font-medium",
                        isLoading && "text-primary animate-pulse",
                        !isLoading && !isCompleted && "text-muted-foreground"
                      )}
                    >
                      {item.text}
                    </span>
                    {isCompleted && (
                      <>
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs">✓</span>
                        </div>
                        {hasDetails && (
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform duration-200 text-green-500",
                            isExpanded && "rotate-180"
                          )} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Expanded Details with different styling */}
                  {hasDetails && isCompleted && (
                    <div 
                      className={cn(
                        "ml-8 p-3 rounded-lg bg-muted/30 border border-green-500/20 space-y-2.5 text-xs overflow-hidden transition-all duration-300 ease-in-out origin-top",
                        isExpanded ? "max-h-96 opacity-100 scale-y-100" : "max-h-0 opacity-0 scale-y-0 p-0 border-0"
                      )}
                    >
                      {item.details.objective && (
                        <div className="animate-fade-in" style={{ animationDelay: "50ms" }}>
                          <span className="text-primary font-semibold">Objective:</span>
                          <p className="text-foreground/90 mt-1">{item.details.objective}</p>
                        </div>
                      )}
                      {item.details.files && item.details.files.length > 0 && (
                        <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
                          <span className="text-primary font-semibold">Files Modified:</span>
                          <div className="mt-1 space-y-1">
                            {item.details.files.map((f, i) => (
                              <div key={i} className="font-mono text-[11px] text-foreground/80 bg-background/50 px-2 py-1 rounded">
                                {f}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.details.effects && item.details.effects.length > 0 && (
                        <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
                          <span className="text-primary font-semibold">Completed:</span>
                          <ul className="text-foreground/80 mt-1 space-y-1">
                            {item.details.effects.map((e, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item.details.agents && item.details.agents.length > 0 && (
                        <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
                          <span className="text-primary font-semibold">Agents:</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {item.details.agents.map((a, i) => (
                              <span key={i} className="bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.details.metrics && item.details.metrics.length > 0 && (
                        <div className="animate-fade-in" style={{ animationDelay: "250ms" }}>
                          <span className="text-primary font-semibold">Metrics:</span>
                          <div className="flex flex-wrap gap-3 mt-1">
                            {item.details.metrics.map((m, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{m.label}:</span>
                                <span className="text-foreground font-semibold">{m.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary metrics for completed state */}
        {status === "completed" && metrics.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-500/20 flex gap-6 animate-fade-in">
            {metrics.map((metric, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{metric.label}:</span>
                <span className="text-sm text-foreground font-semibold">{metric.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};