import { LucideIcon } from "lucide-react";

export interface DataItem {
  text: string;
  icon?: LucideIcon;
  details?: {
    objective?: string;
    sources?: string[];
    citations?: string[];
    agents?: string[];
    preconditions?: string[];
    effects?: string[];
  };
}

export interface Step {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: "pending" | "active" | "completed" | "error";
  data?: DataItem[];
  metrics?: { label: string; value: string }[];
}

interface WorldState {
  goalDefined: boolean;
  goalParsed: boolean;
  stateAssessed: boolean;
  informationGathered: boolean;
  documentsAnalyzed: boolean;
  knowledgeSynthesized: boolean;
  insightsGenerated: boolean;
  verified: boolean;
}

interface Action {
  name: string;
  cost: number;
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>;
  stepGenerator: (goal: string) => Step;
}

/**
 * GOAP (Goal-Oriented Action Planning) Planner
 * Uses A* algorithm to find optimal action sequence
 */
export class GOAPPlanner {
  private actions: Action[];

  constructor(actions: Action[]) {
    this.actions = actions;
  }

  /**
   * Calculate heuristic distance to goal (number of unmet conditions)
   */
  private heuristic(state: WorldState, goal: WorldState): number {
    let distance = 0;
    for (const key in goal) {
      if (goal[key as keyof WorldState] && !state[key as keyof WorldState]) {
        distance++;
      }
    }
    return distance;
  }

  /**
   * Check if all preconditions are met
   */
  private preconditionsMet(state: WorldState, preconditions: Partial<WorldState>): boolean {
    for (const key in preconditions) {
      if (preconditions[key as keyof WorldState] && !state[key as keyof WorldState]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Apply action effects to state
   */
  private applyEffects(state: WorldState, effects: Partial<WorldState>): WorldState {
    return { ...state, ...effects };
  }

  /**
   * Find optimal plan using A* search
   */
  public plan(currentState: WorldState, goalState: WorldState, userGoal: string): Step[] {
    interface Node {
      state: WorldState;
      actions: Action[];
      cost: number;
      heuristic: number;
    }

    const openList: Node[] = [];
    const closedList: Set<string> = new Set();

    // Start node
    openList.push({
      state: currentState,
      actions: [],
      cost: 0,
      heuristic: this.heuristic(currentState, goalState),
    });

    while (openList.length > 0) {
      // Sort by total cost (cost + heuristic)
      openList.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
      
      const current = openList.shift()!;
      const stateKey = JSON.stringify(current.state);

      // Check if goal reached
      if (this.heuristic(current.state, goalState) === 0) {
        // Convert actions to steps
        return current.actions.map(action => action.stepGenerator(userGoal));
      }

      if (closedList.has(stateKey)) continue;
      closedList.add(stateKey);

      // Try all applicable actions
      for (const action of this.actions) {
        if (this.preconditionsMet(current.state, action.preconditions)) {
          const newState = this.applyEffects(current.state, action.effects);
          const newStateKey = JSON.stringify(newState);

          if (!closedList.has(newStateKey)) {
            openList.push({
              state: newState,
              actions: [...current.actions, action],
              cost: current.cost + action.cost,
              heuristic: this.heuristic(newState, goalState),
            });
          }
        }
      }
    }

    // No plan found - return empty array
    return [];
  }
}

/**
 * Parse user goal to extract key information
 */
export function parseGoal(goal: string): {
  domain: string;
  action: string;
  keywords: string[];
} {
  const lowerGoal = goal.toLowerCase();
  
  // Extract domain
  let domain = "general";
  if (lowerGoal.includes("quantum") || lowerGoal.includes("computing")) domain = "technology";
  if (lowerGoal.includes("market") || lowerGoal.includes("business")) domain = "business";
  if (lowerGoal.includes("architecture") || lowerGoal.includes("software")) domain = "software engineering";
  if (lowerGoal.includes("energy") || lowerGoal.includes("renewable")) domain = "energy";

  // Extract action
  let action = "research";
  if (lowerGoal.includes("analyze")) action = "analyze";
  if (lowerGoal.includes("investigate")) action = "investigate";
  if (lowerGoal.includes("compare")) action = "compare";
  if (lowerGoal.includes("evaluate")) action = "evaluate";

  // Extract keywords (simple approach - words > 4 chars)
  const keywords = goal
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 5);

  return { domain, action, keywords };
}
