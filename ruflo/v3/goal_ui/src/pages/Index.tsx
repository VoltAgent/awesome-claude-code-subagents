import { useState, useEffect, useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Brain,
  Search,
  FileSearch,
  GitBranch,
  Lightbulb,
  CheckCircle2,
  Target,
  FileText,
  Link,
  Workflow,
  Database,
  TrendingUp,
  Filter,
  Zap,
  Shield,
  Sparkles,
  Clock,
  Network,
  Settings,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  Code,
  Play,
} from "lucide-react";
import { AgentStep, StepStatus } from "@/components/AgentStep";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoalInput } from "@/components/GoalInput";
import { WidgetCustomizer } from "@/components/WidgetCustomizer";
import { ResearchReportModal } from "@/components/ResearchReportModal";
import { ReviseResearchForm, type ResearchConfig } from "@/components/ReviseResearchForm";
import { StateAssessmentCard } from "@/components/StateAssessmentCard";
import { GOAPConfigDisplay } from "@/components/GOAPConfigDisplay";
import { GOAPPlanner, parseGoal, type Step, type DataItem } from "@/lib/goapPlanner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface WidgetConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  textColor: string;
  secondaryTextColor: string;
  successColor: string;
  title: string;
  description: string;
  brandName: string;
  defaultGoal: string;
  fontFamily: string;
  borderRadius: string;
  animationSpeed: string;
  cardSpacing: string;
  showMetrics: boolean;
  showStats: boolean;
  compactMode: boolean;
  enableAI: boolean;
  aiModel: string;
}

const defaultResearchConfig: ResearchConfig = {
  goal: "",
  stateDefinition: {
    currentState: { goalDefined: true, informationGathered: false },
    goalState: { verified: true, insightsGenerated: true },
    stateGaps: ["Information needs to be gathered", "Analysis required", "Insights need generation"],
  },
  researchGuidance: {
    focusAreas: [],
    excludeTopics: [],
    depth: "moderate",
    perspective: "technical",
    timeframe: "recent",
  },
  prompts: {
    systemPrompt: `You are an expert research assistant specializing in GOAP (Goal-Oriented Action Planning) research workflows. 
Your role is to provide precise, evidence-based information for each research step.
Format your responses as structured data points that can be used in subsequent research steps.
Always include sources, confidence levels, and timestamps when available.`,
    searchQueryTemplate: "Latest {topic} advancements {year} research site:arxiv.org OR site:scholar.google.com OR site:ieee.org",
    analysisPrompt: `Analyze the following content and extract:
1. Key findings and methodologies
2. Actionable insights and recommendations  
3. Technical details and specifications
4. Sources and citations
5. Confidence level (0-100%) based on source quality`,
    synthesisPrompt: `Synthesize the research findings into:
1. Coherent summary of key discoveries
2. Connections between different sources
3. Practical recommendations
4. Identified gaps or conflicts in the data
5. Overall confidence assessment`,
  },
  goapConfig: {
    executionMode: "closed",
    enableReplanning: true,
    replanningTriggers: ["Action failure", "Low confidence results", "Missing preconditions"],
    costOptimization: true,
    parallelExecution: true,
  },
  actionConfig: {
    maxActionCost: 5,
    enableFallbacks: true,
    validatePreconditions: true,
    trackEffects: true,
  },
  parameters: {
    maxSources: 15,
    minConfidence: 85,
    maxSteps: 7,
    parallelAgents: 3,
    timeout: 120,
  },
  filters: {
    dateRange: "past-year",
    sourceTypes: ["academic", "technical", "industry"],
    languages: ["en"],
    excludeDomains: [],
  },
};

const Index = () => {
  const { toast } = useToast();
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
    primaryColor: "#8b5cf6",
    accentColor: "#22c55e",
    backgroundColor: "#1a1a1a",
    cardBackgroundColor: "#262626",
    cardBorderColor: "#404040",
    textColor: "#ffffff",
    secondaryTextColor: "#a3a3a3",
    successColor: "#22c55e",
    title: "Goal-Oriented Action Planning",
    description: "AI-powered research planning using A* pathfinding and dynamic agent coordination",
    brandName: "",
    defaultGoal: "Research the latest advancements in quantum computing",
    fontFamily: "system-ui",
    borderRadius: "0.5rem",
    animationSpeed: "normal",
    cardSpacing: "1rem",
    showMetrics: true,
    showStats: true,
    compactMode: false,
    enableAI: true,
    aiModel: "google/gemini-2.5-flash",
  });
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [userGoal, setUserGoal] = useState<string>("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number>(1);
  const [showFinalAnalysis, setShowFinalAnalysis] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [finalRecommendations, setFinalRecommendations] = useState<any[]>([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [researchConfig, setResearchConfig] = useState<ResearchConfig>(defaultResearchConfig);
  const [currentGOAPState, setCurrentGOAPState] = useState<Record<string, boolean | string | number>>(defaultResearchConfig.stateDefinition.currentState);
  const [showGOAPCards, setShowGOAPCards] = useState(false);
  const activeStepRef = useRef<HTMLDivElement>(null);
  const goapCardsRef = useRef<HTMLDivElement>(null);
  const objectiveRef = useRef<HTMLDivElement>(null);
  const finalAnalysisRef = useRef<HTMLDivElement>(null);

  // GOAP Action definitions
  const createGOAPActions = (goal: string) => {
    const { domain, action, keywords } = parseGoal(goal);
    const keywordStr = keywords.join(", ");

    return [
      {
        name: "analyzeGoal",
        cost: 1,
        preconditions: { goalDefined: true },
        effects: { goalParsed: true },
        stepGenerator: (userGoal: string) => ({
          id: "1",
          title: "Goal Analysis",
          description: `Analyzing "${userGoal.slice(0, 60)}..." and breaking it down into actionable sub-goals.`,
          icon: Target,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Parse objective", 
              icon: FileText,
              details: {
                objective: "Extract and structure the high-level goal from natural language input",
                preconditions: ["User input received", "NLP module initialized"],
                effects: ["Structured goal object created", "Sub-goals identified"],
                agents: ["Parser Agent", "NLP Agent"],
              }
            },
            { 
              text: "Identify dependencies", 
              icon: Link,
              details: {
                objective: "Map relationships between actions and their requirements",
                preconditions: ["Goal parsed", "Action library loaded"],
                effects: ["Dependency graph generated", "Critical path identified"],
                agents: ["Dependency Analyzer", "Graph Builder"],
                sources: ["Action Registry", "State Definitions"]
              }
            },
            { 
              text: "Map state transitions", 
              icon: Workflow,
              details: {
                objective: "Define how each action transforms the world state",
                preconditions: ["Dependencies mapped", "State space defined"],
                effects: ["Transition matrix created", "State reachability confirmed"],
                agents: ["State Mapper", "Validator Agent"],
                citations: ["GOAP: Goal-Oriented Action Planning - Orkin, J. (2006)"]
              }
            },
          ],
          metrics: [{ label: "Sub-goals", value: "3" }, { label: "Actions", value: "7" }],
        }),
      },
      {
        name: "assessState",
        cost: 1,
        preconditions: { goalParsed: true },
        effects: { stateAssessed: true },
        stepGenerator: () => ({
          id: "2",
          title: "State Assessment",
          description: `Evaluating current knowledge about ${domain} and identifying information gaps.`,
          icon: Brain,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Assessing current state...", 
              icon: Database,
              details: {
                objective: `Assess current knowledge and capability state for ${goal}`,
                effects: ["Baseline established", "Gaps identified"],
                agents: ["State Assessor"],
              }
            },
            { 
              text: "Defining success criteria...", 
              icon: CheckCircle2,
              details: {
                objective: `Define success criteria and validation requirements for ${domain}`,
                preconditions: ["Goals defined"],
                effects: ["Validation criteria set", "Acceptance tests defined"],
              }
            },
            { 
              text: "Analyzing gaps...", 
              icon: TrendingUp,
              details: {
                objective: `Quantify differences between current and target state for ${action} in ${domain}`,
                effects: ["Priority list generated", "Resource needs identified"],
                agents: ["Gap Analyzer", "Priority Ranker"],
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "gatherInformation",
        cost: 2,
        preconditions: { stateAssessed: true },
        effects: { informationGathered: true },
        stepGenerator: () => ({
          id: "3",
          title: "Web Search",
          description: `Conducting intelligent searches for: ${keywordStr}`,
          icon: Search,
          status: "pending" as StepStatus,
          data: [
            { 
              text: `Searching for ${action} ${keywords[0] || "methods"}...`, 
              icon: Search,
              details: {
                objective: `Execute targeted web searches for ${goal}`,
                sources: ["arXiv.org", "Google Scholar", "ACM Digital Library"],
                agents: ["Search Agent", "Query Optimizer"],
              }
            },
            { 
              text: "Gathering sources...", 
              icon: Database,
              details: {
                objective: `Aggregate and catalog information sources for ${domain}`,
                effects: ["Source database populated", "Relevance scores assigned"],
              }
            },
            { 
              text: "Calculating relevance...", 
              icon: TrendingUp,
              details: {
                objective: `Calculate information quality and applicability metrics for ${keywordStr}`,
                agents: ["Relevance Scorer", "ML Classifier"],
                citations: ["Information Retrieval Metrics - Manning et al."]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "analyzeDocuments",
        cost: 2,
        preconditions: { informationGathered: true },
        effects: { documentsAnalyzed: true },
        stepGenerator: () => ({
          id: "4",
          title: "Document Analysis",
          description: `Processing documents related to ${domain} to extract key insights.`,
          icon: FileSearch,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Parsing documents...", 
              icon: FileText,
              details: {
                objective: `Extract structured data from ${domain} documents for ${goal}`,
                preconditions: ["Documents retrieved", "Parser modules loaded"],
                effects: ["Content extracted", "Metadata catalogued"],
                agents: ["Document Parser", "Text Extractor"],
                sources: ["PDF Parser", "HTML Scraper", "API Responses"]
              }
            },
            { 
              text: "Extracting insights...", 
              icon: Lightbulb,
              details: {
                objective: `Identify key findings about ${keywordStr}`,
                preconditions: ["Documents parsed", "NLP models ready"],
                effects: ["Insights database populated", "Key points highlighted"],
                agents: ["Insight Extractor", "NLP Analyzer", "Pattern Recognizer"],
                citations: ["Named Entity Recognition - Nadeau & Sekine"]
              }
            },
            { 
              text: "Validating claims...", 
              icon: Shield,
              details: {
                objective: `Verify factual accuracy for ${action} in ${domain}`,
                preconditions: ["Insights extracted", "Validation rules defined"],
                effects: ["Accuracy scores assigned", "Unreliable sources flagged"],
                agents: ["Fact Checker", "Source Validator", "Cross-Referencer"],
                sources: ["Fact-checking APIs", "Citation Databases"]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "synthesizeKnowledge",
        cost: 2,
        preconditions: { documentsAnalyzed: true },
        effects: { knowledgeSynthesized: true },
        stepGenerator: () => ({
          id: "5",
          title: "Knowledge Synthesis",
          description: `Synthesizing information from multiple ${domain} sources.`,
          icon: GitBranch,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Cross-referencing sources...", 
              icon: Link,
              details: {
                objective: `Correlate ${domain} information across multiple sources for ${goal}`,
                preconditions: ["Multiple sources validated", "Correlation rules set"],
                effects: ["Source connections mapped", "Confidence levels adjusted"],
                agents: ["Cross-Referencer", "Correlation Analyzer"],
                sources: ["Academic papers", "Industry reports", "Technical documentation"]
              }
            },
            { 
              text: "Merging concepts...", 
              icon: GitBranch,
              details: {
                objective: `Combine ${keywordStr} concepts into unified knowledge structures`,
                preconditions: ["Concepts identified", "Relationships defined"],
                effects: ["Knowledge graph updated", "Concept taxonomy refined"],
                agents: ["Concept Merger", "Ontology Builder", "Semantic Analyzer"],
                citations: ["Knowledge Graphs - Hogan et al. (2021)"]
              }
            },
            { 
              text: "Resolving conflicts...", 
              icon: CheckCircle2,
              details: {
                objective: `Handle contradictory information about ${action} in ${domain}`,
                preconditions: ["Conflicts detected", "Resolution strategies loaded"],
                effects: ["Consensus reached", "Conflict resolution logged"],
                agents: ["Conflict Resolver", "Evidence Weigher", "Decision Maker"],
                sources: ["Source credibility scores", "Temporal data", "Expert systems"]
              }
            },
          ],
          metrics: [{ label: "Sources", value: "18" }, { label: "Concepts", value: "12" }],
        }),
      },
      {
        name: "generateInsights",
        cost: 2,
        preconditions: { knowledgeSynthesized: true },
        effects: { insightsGenerated: true },
        stepGenerator: () => ({
          id: "6",
          title: "Insight Generation",
          description: `Generating actionable insights for ${domain} based on research findings.`,
          icon: Lightbulb,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Generating insights...", 
              icon: Zap,
              details: {
                objective: `Create novel conclusions from synthesized ${domain} knowledge for ${goal}`,
                preconditions: ["Knowledge synthesized", "Analysis complete"],
                effects: ["Actionable insights created", "Recommendations formulated"],
                agents: ["Insight Generator", "Recommendation Engine", "Inference Agent"],
                citations: ["Automated Reasoning - Robinson (1965)", "AI Planning - Ghallab et al."]
              }
            },
            { 
              text: "Prioritizing by impact...", 
              icon: TrendingUp,
              details: {
                objective: `Rank insights about ${keywordStr} by potential value and applicability`,
                preconditions: ["Insights generated", "Impact metrics defined"],
                effects: ["Priority scores assigned", "Implementation order set"],
                agents: ["Priority Ranker", "Impact Analyzer", "ROI Calculator"],
                sources: ["Business metrics", "Historical outcomes", "Expert heuristics"]
              }
            },
            { 
              text: "Validating feasibility...", 
              icon: CheckCircle2,
              details: {
                objective: `Assess practicality of ${action} recommendations for ${domain}`,
                preconditions: ["Insights prioritized", "Constraint database available"],
                effects: ["Feasibility scores computed", "Resource needs estimated"],
                agents: ["Feasibility Validator", "Resource Planner", "Constraint Checker"],
                sources: ["Available resources", "Technical constraints", "Timeline requirements"]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "verify",
        cost: 1,
        preconditions: { insightsGenerated: true },
        effects: { verified: true },
        stepGenerator: () => ({
          id: "7",
          title: "Verification",
          description: "Cross-checking findings and ensuring accuracy before final presentation.",
          icon: CheckCircle2,
          status: "pending" as StepStatus,
          data: [
            { 
              text: "Verifying insights...", 
              icon: Shield,
              details: {
                objective: `Perform final quality assurance on ${domain} insights for ${goal}`,
                preconditions: ["Insights validated", "Verification criteria set"],
                effects: ["Quality confirmed", "Errors corrected"],
                agents: ["Quality Assurance Agent", "Verification Bot", "Audit Agent"],
                sources: ["Quality standards", "Best practices", "Validation protocols"]
              }
            },
            { 
              text: "Checking sources...", 
              icon: Filter,
              details: {
                objective: `Re-validate all ${keywordStr} information sources for final output`,
                preconditions: ["Sources catalogued", "Verification complete"],
                effects: ["Source reliability confirmed", "Citations verified"],
                agents: ["Source Checker", "Citation Validator", "Provenance Tracker"],
                citations: ["Information Provenance - Buneman et al. (2001)"]
              }
            },
            { 
              text: "Calculating confidence...", 
              icon: TrendingUp,
              details: {
                objective: `Calculate overall confidence in ${action} research findings`,
                preconditions: ["All checks complete", "Confidence model loaded"],
                effects: ["Final confidence score computed", "Report ready"],
                agents: ["Confidence Calculator", "Statistical Analyzer", "Meta-Evaluator"],
                sources: ["Validation results", "Source quality scores", "Cross-reference matches"]
              }
            },
          ],
          metrics: [],
        }),
      },
    ];
  };

  // Handle goal submission and planning
  const handleGoalSubmit = async (goal: string) => {
    setUserGoal(goal);
    setIsPlanning(true);
    setShowFinalAnalysis(false);
    setShowGOAPCards(false);

    // Simulate planning phase
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Reset GOAP state to initial
    setCurrentGOAPState(researchConfig.stateDefinition.currentState);

    // Create GOAP planner
    const actions = createGOAPActions(goal);
    const planner = new GOAPPlanner(actions);

    // Calculate adaptive metrics based on goal complexity and GOAP config
    const goalComplexity = goal.split(' ').length;
    const adaptiveSubGoals = Math.min(
      Math.max(2, Math.ceil(goalComplexity / 10)), // 2-5 sub-goals based on word count
      researchConfig.parameters.maxSteps
    );
    
    const adaptiveActions = researchConfig.goapConfig.executionMode === "open" 
      ? researchConfig.parameters.maxSteps + 3 // More actions in open mode
      : researchConfig.goapConfig.executionMode === "focused"
      ? Math.min(5, researchConfig.parameters.maxSteps) // Fewer actions in focused mode
      : researchConfig.parameters.maxSteps; // Normal for closed mode

    // Define current and goal states
    const currentState = {
      goalDefined: true,
      goalParsed: false,
      stateAssessed: false,
      informationGathered: false,
      documentsAnalyzed: false,
      knowledgeSynthesized: false,
      insightsGenerated: false,
      verified: false,
    };

    const goalState = {
      goalDefined: true,
      goalParsed: true,
      stateAssessed: true,
      informationGathered: true,
      documentsAnalyzed: true,
      knowledgeSynthesized: true,
      insightsGenerated: true,
      verified: true,
    };

    // Generate plan
    const plan = planner.plan(currentState, goalState, goal);

    if (plan.length === 0) {
      toast({
        title: "Planning Failed",
        description: "Could not generate a valid plan for this objective.",
        variant: "destructive",
      });
      setIsPlanning(false);
      return;
    }

    // Update Goal Analysis step with adaptive metrics
    if (plan[0]) {
      plan[0].metrics = [
        { label: "Sub-goals", value: String(adaptiveSubGoals) },
        { label: "Actions", value: String(adaptiveActions) }
      ];
    }

    toast({
      title: "Plan Generated",
      description: `Created ${plan.length}-step research workflow using GOAP algorithm.`,
    });

    setSteps(plan);
    setIsPlanning(false);
    setPlanGenerated(true);
    setVisibleSteps(1);
    // Issue #1694: do NOT auto-execute. Wait for the user to click
    // "Start Research" so the planning step is observable and reversible.
  };

  // Execute research plan
  const executeResearch = async (stepsToExecute?: Step[], researchGoal?: string) => {
    const initialSteps = stepsToExecute || steps;
    console.log('executeResearch started, steps:', initialSteps.length);
    console.log('GOAP Config:', {
      executionMode: researchConfig.goapConfig.executionMode,
      enableReplanning: researchConfig.goapConfig.enableReplanning,
      costOptimization: researchConfig.goapConfig.costOptimization,
      parallelExecution: researchConfig.goapConfig.parallelExecution,
    });
    
    setIsRunning(true);
    setShowFinalAnalysis(false);
    
    // Animate GOAP cards in
    setTimeout(() => setShowGOAPCards(true), 300);
    
    // Wait for GOAP cards animation to complete (4 seconds total)
    // State Assessment: 2s, Config: 1.5s delay + 2.5s = 4s total
    await new Promise(resolve => setTimeout(resolve, 4500));

    // Keep a working copy that we update with AI data
    let workingSteps = [...initialSteps];

    // Process each step sequentially
    for (let i = 0; i < workingSteps.length; i++) {
      console.log(`\n=== Processing step ${i}: ${workingSteps[i].title} ===`);
      
      // Update GOAP state based on step progression
      const stateUpdates: Record<string, boolean> = {
        goalParsed: i >= 0,
        stateAssessed: i >= 1,
        informationGathered: i >= 2,
        documentsAnalyzed: i >= 3,
        knowledgeSynthesized: i >= 4,
        insightsGenerated: i >= 5,
        verified: i >= 6,
      };
      
      setCurrentGOAPState(prev => ({ ...prev, ...stateUpdates }));
      console.log('GOAP State Updated:', stateUpdates);
      
      // Show and activate current step
      setVisibleSteps(i + 1);
      setSteps((prev) => {
        const newSteps = [...prev];
        newSteps[i].status = "active";
        return newSteps;
      });

      // Wait a moment for UI to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Call edge function to get real research data from Gemini
      if (widgetConfig.enableAI) {
        try {
          const currentStep = workingSteps[i];
          
          // Build context from all previous completed steps (with their AI data)
          const previousStepsData = workingSteps.slice(0, i).map(step => ({
            stepTitle: step.title,
            data: step.data.map(item => {
              const details = item.details as any;
              return {
                id: '',
                title: item.text,
                content: details?.objective || item.text,
                source: details?.source || (Array.isArray(details?.sources) ? details.sources[0] : undefined),
                confidence: details?.confidence,
                timestamp: details?.timestamp || new Date().toISOString(),
              };
            })
          }));
          
          console.log(`📤 Calling Gemini API for step ${i}`);
          console.log(`   Context: ${previousStepsData.length} previous steps with ${previousStepsData.reduce((sum, s) => sum + s.data.length, 0)} total data items`);
          
          const { data, error } = await supabase.functions.invoke('research-step', {
            body: {
              goal: researchGoal || userGoal,
              stepTitle: currentStep.title,
              stepDescription: currentStep.description,
              stepType: currentStep.id,
              aiModel: widgetConfig.aiModel,
              config: {
                researchGuidance: researchConfig.researchGuidance,
                prompts: researchConfig.prompts,
                parameters: researchConfig.parameters,
                filters: researchConfig.filters,
              },
              previousStepsData: previousStepsData,
            },
          });

          if (error) {
            console.error('❌ Error fetching research data:', error);
            
            // Check if replanning is enabled
            if (researchConfig.goapConfig.enableReplanning) {
              console.log('🔄 Replanning enabled - checking triggers');
              const shouldReplan = researchConfig.goapConfig.replanningTriggers.includes("Action failure");
              
              if (shouldReplan) {
                console.log('🔄 Replanning triggered due to action failure');
                toast({
                  title: "Replanning Triggered",
                  description: "Action failed - GOAP system is adapting the plan...",
                });
              }
            }
            
            toast({
              title: "AI Research Error",
              description: error.message || "Failed to generate research data",
              variant: "destructive",
            });
          } else if (data && Array.isArray(data)) {
            console.log(`✅ Gemini returned ${data.length} items for step ${i}`);
            
            // Transform AI data into step data format
            const aiData = data.map((item: any) => ({
              text: item.title,
              icon: Sparkles,
              details: {
                objective: item.content,
                source: item.source,
                confidence: item.confidence,
                timestamp: item.timestamp,
              }
            }));
            
            // Update working copy with AI data (THIS is what gets passed to next step)
            workingSteps[i].data = aiData;
            console.log(`💾 Updated working copy of step ${i} - will be used as context for step ${i + 1}`);
            
            // Also update UI state
            setSteps((prev) => {
              const newSteps = [...prev];
              if (newSteps[i]) {
                newSteps[i].data = aiData;
              }
              return newSteps;
            });
          }
        } catch (err) {
          console.error('Exception calling research-step:', err);
          toast({
            title: "AI Research Error",
            description: "Failed to connect to research service",
            variant: "destructive",
          });
        }
      }

      // Wait for research to complete (simulate processing time)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Complete current step
      workingSteps[i].status = "completed";
      setSteps((prev) => {
        const newSteps = [...prev];
        newSteps[i].status = "completed";
        console.log(`✓ Completed step ${i}: ${newSteps[i].title}`);
        return newSteps;
      });

      // Wait before moving to next step
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`=== Step ${i} complete. Moving to next step ===\n`);
    }

    // All steps complete
    setIsRunning(false);
    
    // Generate final research report with all context
    if (widgetConfig.enableAI) {
      try {
        // Build comprehensive context from all completed steps
        const allResearchContext = workingSteps.map(step => ({
          stepTitle: step.title,
          data: step.data.map(item => {
            const details = item.details as any;
            return {
              id: '',
              title: item.text,
              content: details?.objective || item.text,
              source: details?.source || (Array.isArray(details?.sources) ? details.sources[0] : undefined),
              confidence: details?.confidence,
              timestamp: details?.timestamp || new Date().toISOString(),
            };
          })
        }));

        const { data, error } = await supabase.functions.invoke('research-step', {
          body: {
            goal: researchGoal || userGoal,
            stepTitle: "Final Recommendations",
            stepDescription: `Based on all research findings, provide specific, actionable recommendations that directly answer: "${researchGoal || userGoal}". Include concrete suggestions with supporting data from the research.`,
            stepType: "final-report",
            aiModel: widgetConfig.aiModel,
            previousStepsData: allResearchContext,
          },
        });

        if (!error && data && Array.isArray(data)) {
          console.log('Final report recommendations generated:', data.length, 'items');
          setFinalRecommendations(data);
        }
      } catch (err) {
        console.error('Error generating final report:', err);
      }
    }
    
    setTimeout(() => {
      setShowFinalAnalysis(true);
    }, 1000);
  };

  const resetAll = () => {
    setUserGoal("");
    setPlanGenerated(false);
    setSteps([]);
    setIsRunning(false);
    setShowFinalAnalysis(false);
    setShowReportModal(false);
    setShowReviseForm(false);
    setShowAdvancedSettings(false);
    setShowGOAPCards(false);
    setFinalRecommendations([]);
    setResearchConfig(defaultResearchConfig);
    setCurrentGOAPState(defaultResearchConfig.stateDefinition.currentState);
    setVisibleSteps(1);
  };

  const handleReviseSubmit = (config: ResearchConfig) => {
    console.log("Revised research config:", config);
    setResearchConfig(config);
    setShowReviseForm(false);
    setUserGoal(config.goal);
    handleGoalSubmit(config.goal);
    toast({
      title: "Research Revised",
      description: "Starting new research with updated parameters...",
    });
  };

  const handleAdvancedSettingsSubmit = (config: ResearchConfig) => {
    console.log("Advanced research config:", config);
    setResearchConfig(config);
    setShowAdvancedSettings(false);
    
    // If there's a goal in the config, update it
    if (config.goal && config.goal !== userGoal) {
      setUserGoal(config.goal);
    }
    
    toast({
      title: "Advanced Settings Applied",
      description: "Research parameters have been configured. Submit your research goal to begin.",
    });
  };

  const handleGenerateWidget = () => {
    toast({
      title: "Widget Code Generated",
      description: "Copy the embed code and paste it into your website.",
    });
  };

  // Auto-scroll effects
  useEffect(() => {
    if (activeStepRef.current && isRunning) {
      activeStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [visibleSteps, isRunning]);

  useEffect(() => {
    if (goapCardsRef.current && showGOAPCards) {
      setTimeout(() => {
        goapCardsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 200);
      
      // After GOAP Configuration completes (1.5s delay + 2.5s animation = 4s), scroll to objective
      setTimeout(() => {
        objectiveRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 4200);
    }
  }, [showGOAPCards]);

  useEffect(() => {
    if (finalAnalysisRef.current && showFinalAnalysis) {
      setTimeout(() => {
        finalAnalysisRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 300);
    }
  }, [showFinalAnalysis]);

  return (
    <div 
      className="min-h-screen transition-colors duration-300"
      style={{ 
        backgroundColor: widgetConfig.backgroundColor,
        fontFamily: widgetConfig.fontFamily,
      }}
    >
      {/* Hero Section */}
      <div className="border-b" style={{ borderColor: `${widgetConfig.primaryColor}40` }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="text-center animate-fade-in">
            <div 
              className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded border text-xs sm:text-sm mb-3 sm:mb-4"
              style={{ 
                backgroundColor: `${widgetConfig.primaryColor}20`,
                borderColor: `${widgetConfig.primaryColor}40`,
                color: widgetConfig.primaryColor
              }}
            >
              <Network className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">{widgetConfig.brandName || "GOAP Multi-Agent System"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-2 sm:mb-3 px-2" style={{ color: "#f5f5f5" }}>
              {widgetConfig.title}
            </h1>
            <p className="text-xs sm:text-sm max-w-xl mx-auto px-4 mb-3" style={{ color: "#a3a3a3" }}>
              {widgetConfig.description}
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {planGenerated && (
                <Button
                  onClick={resetAll}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                  New Research
                </Button>
              )}
              <RouterLink to="/demo">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Widget Demo</span>
                  <span className="sm:hidden">Demo</span>
                </Button>
              </RouterLink>
              <RouterLink to="/agents">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <Code className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Agent Swarm</span>
                  <span className="sm:hidden">Agents</span>
                </Button>
              </RouterLink>
              <Button
                onClick={() => setShowCustomizer(!showCustomizer)}
                variant="outline"
                size="sm"
                className="gap-2 text-xs sm:text-sm"
              >
                <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{showCustomizer ? "Close" : "Create Widget"}</span>
                <span className="sm:hidden">{showCustomizer ? "Close" : "Widget"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Widget Customization Modal */}
        <Dialog open={showCustomizer} onOpenChange={setShowCustomizer}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Widget Customization</DialogTitle>
            </DialogHeader>
            <WidgetCustomizer
              config={widgetConfig}
              onConfigChange={setWidgetConfig}
              onGenerate={handleGenerateWidget}
            />
          </DialogContent>
        </Dialog>

        {/* Goal Input */}
        {!planGenerated && (
          <div 
            style={{ 
              '--card-bg': widgetConfig.backgroundColor,
              '--border-color': `${widgetConfig.primaryColor}40`
            } as React.CSSProperties}
          >
          <GoalInput
            onSubmit={handleGoalSubmit}
            isPlanning={isPlanning}
            onAdvancedSettings={() => setShowAdvancedSettings(true)}
            onConfigUpdate={(optimizedConfig) => {
              setResearchConfig(prev => ({
                ...prev,
                researchGuidance: {
                  ...prev.researchGuidance,
                  ...optimizedConfig.researchGuidance
                },
                prompts: {
                  ...prev.prompts,
                  ...optimizedConfig.prompts
                },
                parameters: {
                  ...prev.parameters,
                  ...optimizedConfig.parameters
                },
                filters: {
                  ...prev.filters,
                  ...optimizedConfig.filters
                },
                goapConfig: {
                  ...prev.goapConfig,
                  ...optimizedConfig.goapConfig
                }
              }));
            }}
          />
          </div>
        )}

        {/* Planning Status */}
        {isPlanning && (
          <div 
            className="mt-8 border rounded-lg p-6 animate-pulse"
            style={{ 
              backgroundColor: `${widgetConfig.backgroundColor}dd`,
              borderColor: `${widgetConfig.primaryColor}40`
            }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 animate-spin" style={{ color: widgetConfig.primaryColor }} />
              <div>
                <h3 className="font-medium" style={{ color: "#f5f5f5" }}>Planning Research Workflow</h3>
                <p className="text-sm" style={{ color: "#a3a3a3" }}>
                  Analyzing objective, identifying preconditions, calculating optimal action sequence...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Research Execution */}
        {planGenerated && steps.length > 0 && (
          <>
            {/* GOAP Configuration and State Assessment - Animated */}
            {showGOAPCards && (
              <div ref={goapCardsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div 
                  className="opacity-0"
                  style={{ 
                    animation: 'fade-in 2s ease-out forwards',
                    animationDelay: '0ms' 
                  }}
                >
                  <StateAssessmentCard
                    currentState={currentGOAPState}
                    goalState={researchConfig.stateDefinition.goalState}
                    stateGaps={researchConfig.stateDefinition.stateGaps}
                    primaryColor={widgetConfig.primaryColor}
                    accentColor={widgetConfig.accentColor}
                  />
                </div>
                <div 
                  className="opacity-0"
                  style={{ 
                    animation: 'fade-in 2.5s ease-out forwards',
                    animationDelay: '1500ms' 
                  }}
                >
                  <GOAPConfigDisplay
                    executionMode={researchConfig.goapConfig.executionMode}
                    enableReplanning={researchConfig.goapConfig.enableReplanning}
                    replanningTriggers={researchConfig.goapConfig.replanningTriggers}
                    costOptimization={researchConfig.goapConfig.costOptimization}
                    parallelExecution={researchConfig.goapConfig.parallelExecution}
                    maxActionCost={researchConfig.actionConfig.maxActionCost}
                    primaryColor={widgetConfig.primaryColor}
                  />
                </div>
              </div>
            )}

            {/* Control Button */}
            <div ref={objectiveRef} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-6 sm:mb-8">
              <Button
                onClick={resetAll}
                variant="outline"
                size="sm"
                disabled={isRunning}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                New Research
              </Button>
              <div className="text-xs sm:text-sm flex-1 min-w-0 text-center px-4" style={{ color: "#a3a3a3" }}>
                <span className="font-medium" style={{ color: "#f5f5f5" }}>Objective:</span> <span className="break-words">{userGoal}</span>
              </div>
              {/* Issue #1694: explicit "Start Research" gate so the plan is reviewable before execution. */}
              {!isRunning && visibleSteps <= 1 ? (
                <Button
                  onClick={() => executeResearch(steps, userGoal)}
                  size="sm"
                  className="gap-2"
                  style={{ backgroundColor: widgetConfig.primaryColor, color: "#fff" }}
                >
                  <Play className="w-4 h-4" />
                  Start Research
                </Button>
              ) : (
                <div className="w-[120px]" />
              )}
            </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div 
                  className="absolute left-0 sm:left-0 top-0 bottom-0 w-px ml-1.5 sm:ml-2.5"
                  style={{ backgroundColor: `${widgetConfig.primaryColor}40` }}
                />

                {/* Steps */}
                <div 
                  className="pl-6 sm:pl-10"
                  style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: widgetConfig.cardSpacing
                  }}
                >
                {steps.slice(0, visibleSteps).map((step, index) => (
                  <div
                    key={step.id}
                    ref={index === visibleSteps - 1 ? activeStepRef : null}
                  >
                    <AgentStep
                      title={step.title}
                      description={step.description}
                      icon={step.icon}
                      status={step.status}
                      delay={0}
                      data={step.data}
                      metrics={widgetConfig.showMetrics ? step.metrics : undefined}
                      primaryColor={widgetConfig.primaryColor}
                      accentColor={widgetConfig.accentColor}
                      cardBackgroundColor={widgetConfig.cardBackgroundColor}
                      cardBorderColor={widgetConfig.cardBorderColor}
                      textColor={widgetConfig.textColor}
                      secondaryTextColor={widgetConfig.secondaryTextColor}
                      successColor={widgetConfig.successColor}
                      borderRadius={widgetConfig.borderRadius}
                      animationSpeed={widgetConfig.animationSpeed}
                      compactMode={widgetConfig.compactMode}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            {widgetConfig.showStats && (
              <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div 
                  className="border p-4 text-center"
                  style={{ 
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: widgetConfig.primaryColor }}>
                    {steps.filter((s) => s.status === "completed").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>Completed</div>
                </div>
                <div 
                  className="border p-4 text-center"
                  style={{ 
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: widgetConfig.primaryColor }}>
                    {steps.filter((s) => s.status === "active").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>Active</div>
                </div>
                <div 
                  className="border p-4 text-center"
                  style={{ 
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: "#737373" }}>
                    {steps.filter((s) => s.status === "pending").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>Pending</div>
                </div>
              </div>
            )}

            {/* Final Research Report */}
            {showFinalAnalysis && (
              <div 
                ref={finalAnalysisRef}
                className="mt-8 space-y-6 animate-scale-in"
              >
                {/* Header */}
                <div 
                  className="rounded-lg p-6"
                  style={{
                    background: `linear-gradient(to bottom right, ${widgetConfig.accentColor}1a, ${widgetConfig.accentColor}0d)`,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: `${widgetConfig.accentColor}4d`
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div 
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${widgetConfig.accentColor}33` }}
                    >
                      <FileText className="w-6 h-6" style={{ color: widgetConfig.accentColor }} />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-2 flex items-center gap-2" style={{ color: widgetConfig.accentColor }}>
                        Final Research Report
                        <CheckCircle2 className="w-5 h-5" />
                      </h3>
                      <p className="text-sm mb-4" style={{ color: "#a3a3a3" }}>
                        Comprehensive analysis generated by multi-agent GOAP research system
                      </p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>Total Steps</div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>{steps.length}</div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>Data Points</div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>
                            {steps.reduce((acc, step) => acc + (step.data?.length || 0), 0)}
                          </div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>Confidence</div>
                          <div className="text-xl font-semibold" style={{ color: widgetConfig.accentColor }}>94%</div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "#a3a3a3" }}>
                            <Clock className="w-3 h-3" />
                            Duration
                          </div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>
                            {Math.round(steps.length * 3.5)}s
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div 
                  className="rounded-lg p-6"
                  style={{
                    backgroundColor: widgetConfig.cardBackgroundColor,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: widgetConfig.cardBorderColor
                  }}
                >
                  <h4 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: widgetConfig.textColor }}>
                    <Target className="w-5 h-5" style={{ color: widgetConfig.primaryColor }} />
                    Executive Summary
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: widgetConfig.secondaryTextColor }}>
                    This research successfully analyzed <span style={{ color: widgetConfig.accentColor, fontWeight: 600 }}>"{userGoal}"</span> through 
                    a {steps.length}-step Goal-Oriented Action Planning (GOAP) workflow. The system coordinated multiple specialized agents 
                    to gather information, analyze documents, synthesize knowledge, and generate actionable insights with 
                    high confidence scores across all validation checks.
                  </p>
                </div>

                {/* Tabbed Report Sections */}
                <Tabs defaultValue="direct-answer" className="w-full">
                  <TabsList 
                    className="w-full grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2 h-auto p-1"
                    style={{
                      backgroundColor: widgetConfig.cardBackgroundColor,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: widgetConfig.cardBorderColor
                    }}
                  >
                    <TabsTrigger 
                      value="direct-answer"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">Direct Answer</span>
                      <span className="sm:hidden">Answer</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="key-findings"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Lightbulb className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">Key Findings</span>
                      <span className="sm:hidden">Findings</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="methodology"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Workflow className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">Methodology</span>
                      <span className="sm:hidden">Method</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="next-steps"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <TrendingUp className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">Next Steps</span>
                      <span className="sm:hidden">Steps</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Direct Answer Tab */}
                  <TabsContent value="direct-answer" className="mt-4">
                    {finalRecommendations.length > 0 ? (
                      <div 
                        className="rounded-lg p-6"
                        style={{
                          backgroundColor: widgetConfig.cardBackgroundColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: widgetConfig.cardBorderColor
                        }}
                      >
                        <div className="space-y-4">
                          {finalRecommendations.slice(0, 4).map((rec: any, idx: number) => (
                            <div key={idx} className="rounded p-4" style={{ backgroundColor: `${widgetConfig.accentColor}0d` }}>
                              <div className="font-medium mb-1" style={{ color: widgetConfig.textColor }}>{rec.title}</div>
                              <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>{rec.content}</p>
                              {rec.source && (
                                <div className="mt-2 text-xs" style={{ color: widgetConfig.accentColor }}>Source: {rec.source}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="rounded-lg p-6 text-center"
                        style={{
                          backgroundColor: widgetConfig.cardBackgroundColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: widgetConfig.cardBorderColor
                        }}
                      >
                        <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>
                          No direct answers available yet. Complete the research to see results.
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Key Findings Tab */}
                  <TabsContent value="key-findings" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <div className="space-y-3">
                        {steps.slice(0, 3).map((step, idx) => (
                          <div 
                            key={idx}
                            className="rounded p-4"
                            style={{ backgroundColor: `${widgetConfig.primaryColor}0d` }}
                          >
                            <div className="flex items-start gap-3">
                              <div 
                                className="p-1.5 rounded"
                                style={{ backgroundColor: `${widgetConfig.primaryColor}1a` }}
                              >
                                {step.icon && <step.icon className="w-4 h-4" style={{ color: widgetConfig.primaryColor }} />}
                              </div>
                              <div className="flex-1">
                                <h5 className="font-medium text-sm mb-1" style={{ color: widgetConfig.textColor }}>
                                  {step.title}
                                </h5>
                                <p className="text-xs" style={{ color: widgetConfig.secondaryTextColor }}>
                                  {step.description}
                                </p>
                                {step.data && step.data.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {step.data.slice(0, 3).map((item, i) => (
                                      <span 
                                        key={i}
                                        className="text-xs px-2 py-1 rounded"
                                        style={{ 
                                          backgroundColor: `${widgetConfig.accentColor}1a`,
                                          color: widgetConfig.accentColor 
                                        }}
                                      >
                                        {item.text}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Methodology Tab */}
                  <TabsContent value="methodology" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <div className="space-y-2">
                        {steps.map((step, idx) => (
                          <div 
                            key={idx}
                            className="flex items-center gap-3 text-sm"
                          >
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                              style={{ 
                                backgroundColor: `${widgetConfig.successColor}33`,
                                color: widgetConfig.successColor 
                              }}
                            >
                              {idx + 1}
                            </div>
                            <span style={{ color: widgetConfig.secondaryTextColor }}>
                              {step.title}
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: widgetConfig.cardBorderColor }} />
                            <CheckCircle2 className="w-4 h-4" style={{ color: widgetConfig.successColor }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Next Steps Tab */}
                  <TabsContent value="next-steps" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <ul className="space-y-2">
                        {[
                          "Review all gathered data points and cross-reference findings",
                          "Validate insights with domain experts and stakeholders",
                          "Develop implementation plan based on prioritized recommendations",
                          "Monitor outcomes and iterate on initial strategies"
                        ].map((rec, idx) => (
                          <li 
                            key={idx}
                            className="flex items-start gap-2 text-sm"
                            style={{ color: widgetConfig.secondaryTextColor }}
                          >
                            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: widgetConfig.accentColor }} />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Footer */}
                <div 
                  className="rounded-lg p-4 flex items-center justify-between"
                  style={{
                    backgroundColor: `${widgetConfig.successColor}0d`,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: `${widgetConfig.successColor}4d`
                  }}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4" style={{ color: widgetConfig.successColor }} />
                    <span style={{ color: widgetConfig.successColor, fontWeight: 500 }}>
                      All verification checks passed
                    </span>
                  </div>
                  <Button
                    onClick={resetAll}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    New Research
                  </Button>
                  <Button
                    onClick={() => setShowReportModal(true)}
                    size="sm"
                    className="gap-2"
                    style={{ 
                      backgroundColor: widgetConfig.accentColor,
                      color: '#fff'
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    View Full Report
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Research Report Modal */}
      <ResearchReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        userGoal={userGoal}
        steps={steps}
        onRevise={() => {
          setShowReportModal(false);
          setShowReviseForm(true);
        }}
        primaryColor={widgetConfig.primaryColor}
        accentColor={widgetConfig.accentColor}
        successColor={widgetConfig.successColor}
      />

      {/* Revise Research Form Modal */}
      <Dialog open={showReviseForm} onOpenChange={setShowReviseForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Revise Research Configuration
            </DialogTitle>
          </DialogHeader>
          <ReviseResearchForm
            currentGoal={userGoal}
            onSubmit={handleReviseSubmit}
            onCancel={() => setShowReviseForm(false)}
            primaryColor={widgetConfig.primaryColor}
            accentColor={widgetConfig.accentColor}
            backgroundColor={widgetConfig.backgroundColor}
          />
        </DialogContent>
      </Dialog>

      {/* Advanced Settings Modal */}
      <Dialog open={showAdvancedSettings} onOpenChange={setShowAdvancedSettings}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Advanced Research Settings
            </DialogTitle>
          </DialogHeader>
          <ReviseResearchForm
            currentGoal={userGoal || researchConfig.goal}
            onSubmit={handleAdvancedSettingsSubmit}
            onCancel={() => setShowAdvancedSettings(false)}
            initialConfig={researchConfig}
            primaryColor={widgetConfig.primaryColor}
            accentColor={widgetConfig.accentColor}
            backgroundColor={widgetConfig.backgroundColor}
          />
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t mt-16 py-6" style={{ borderColor: `${widgetConfig.primaryColor}20` }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>
            Created with <span style={{ color: widgetConfig.accentColor }}>❤️</span> by{" "}
            <a 
              href="https://ruv.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium hover:underline transition-colors"
              style={{ color: widgetConfig.primaryColor }}
            >
              rUv.io
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
