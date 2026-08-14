import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bot, 
  Code, 
  TestTube, 
  FileCheck, 
  FileText, 
  Server,
  Target,
  GitBranch,
  Zap,
  Shield,
  MessageSquare,
  Eye,
  Play,
  Pause,
  SkipForward,
  RotateCw,
  Network,
  CheckCircle2
} from "lucide-react";
import { AgentStatusCard } from "@/components/agents/AgentStatusCard";
import { TaskBoard } from "@/components/agents/TaskBoard";
import { DependencyGraph } from "@/components/agents/DependencyGraph";
import { ExecutionMonitor } from "@/components/agents/ExecutionMonitor";
import { QualityGates } from "@/components/agents/QualityGates";
import { CommunicationLog } from "@/components/agents/CommunicationLog";
import { CodePreview } from "@/components/agents/CodePreview";
import { AgentStep, StepStatus } from "@/components/AgentStep";
import { DevelopmentStep } from "@/components/DevelopmentStep";
import { StateAssessmentCard } from "@/components/StateAssessmentCard";
import { AdvancedSettingsModal } from "@/components/agents/AdvancedSettingsModal";
import { PlanVisualization } from "@/components/agents/PlanVisualization";
import { StepExecutionPanel } from "@/components/agents/StepExecutionPanel";
import { AgentActivityPanel } from "@/components/agents/AgentActivityPanel";
import { RealTimeEventLog } from "@/components/agents/RealTimeEventLog";
import { ExecutionDashboard } from "@/components/agents/ExecutionDashboard";
import { ResearchReviewCard } from "@/components/ResearchReviewCard";

type AgentStatus = "idle" | "working" | "blocked";
type SwarmMode = "distributed" | "pipeline" | "collaborative";

interface Agent {
  id: string;
  name: string;
  icon: any;
  status: AgentStatus;
  currentTask?: string;
}

export default function Agents() {
  const [goal, setGoal] = useState("");
  const [swarmMode, setSwarmMode] = useState<SwarmMode>("distributed");
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  const [workflowStage, setWorkflowStage] = useState<"research" | "review" | "development">("research");
  const [devPhase, setDevPhase] = useState(0);

  const [agents, setAgents] = useState<Agent[]>([
    { id: "arch", name: "Architecture", icon: GitBranch, status: "idle" },
    { id: "impl", name: "Implementation", icon: Code, status: "idle" },
    { id: "test", name: "Testing", icon: TestTube, status: "idle" },
    { id: "review", name: "Code Review", icon: FileCheck, status: "idle" },
    { id: "docs", name: "Documentation", icon: FileText, status: "idle" },
    { id: "devops", name: "DevOps", icon: Server, status: "idle" },
  ]);

  const [projectState, setProjectState] = useState({
    codebaseAnalyzed: 0,
    testsWritten: 0,
    codeReviewed: 0,
    deployed: 0,
    documented: 0,
  });

  const [qualityMetrics, setQualityMetrics] = useState({
    compileCheck: true,
    testCoverage: 85,
    securityScore: 92,
  });

  const handleGeneratePlan = () => {
    if (!goal.trim()) return;
    
    setIsPlanGenerated(true);
    setCurrentPhase(0);
    setIsRunning(true);
    setWorkflowStage("research");
    
    // Sequential phase progression with delays
    setTimeout(() => setCurrentPhase(1), 1000);
    setTimeout(() => setCurrentPhase(2), 8000);
    setTimeout(() => setCurrentPhase(3), 16000);
    setTimeout(() => setCurrentPhase(4), 24000);
    setTimeout(() => setCurrentPhase(5), 32000);
    setTimeout(() => {
      setIsRunning(false);
      setCurrentPhase(5);
      setWorkflowStage("review"); // Move to review after research completes
    }, 40000);
  };

  const handleApproveResearch = () => {
    console.log("Approving research, transitioning to development phase");
    setWorkflowStage("development");
    setDevPhase(0);
    setIsRunning(true);
    
    // Start development swarm execution
    setTimeout(() => {
      console.log("Dev phase 1");
      setDevPhase(1);
    }, 1000);
    setTimeout(() => {
      console.log("Dev phase 2");
      setDevPhase(2);
    }, 8000);
    setTimeout(() => {
      console.log("Dev phase 3");
      setDevPhase(3);
    }, 16000);
    setTimeout(() => {
      console.log("Dev phase 4");
      setDevPhase(4);
    }, 24000);
    setTimeout(() => {
      console.log("Dev phase 5");
      setDevPhase(5);
    }, 32000);
    setTimeout(() => {
      console.log("Development complete");
      setIsRunning(false);
      setDevPhase(5);
    }, 40000);
  };

  const handleReviseResearch = (feedback: string) => {
    console.log("Revising research with feedback:", feedback);
    // Reset and restart research
    setWorkflowStage("research");
    handleGeneratePlan();
  };

  const handleStartSwarm = () => {
    if (!isPlanGenerated) {
      handleGeneratePlan();
      return;
    }
    
    const newRunning = !isRunning;
    setIsRunning(newRunning);
    
    if (newRunning) {
      setCurrentPhase(0);
      
      // Sequential phase progression with delays
      setTimeout(() => setCurrentPhase(1), 1000);
      setTimeout(() => setCurrentPhase(2), 8000);
      setTimeout(() => setCurrentPhase(3), 16000);
      setTimeout(() => setCurrentPhase(4), 24000);
      setTimeout(() => setCurrentPhase(5), 32000);
      setTimeout(() => {
        setIsRunning(false);
        setCurrentPhase(5);
      }, 40000);
    } else {
      setCurrentPhase(0);
    }
  };

  const getPhaseStatus = (phaseIndex: number): StepStatus => {
    if (currentPhase === 0 && !isRunning) return "pending";
    if (phaseIndex < currentPhase) return "completed";
    if (phaseIndex === currentPhase && isRunning) return "active";
    if (phaseIndex === currentPhase && !isRunning) return "completed";
    return "pending";
  };

  const shouldShowPhase = (phaseIndex: number): boolean => {
    if (!isRunning && currentPhase === 0) return false;
    return phaseIndex <= currentPhase;
  };

  // Auto-scroll to newly revealed cards
  const assessmentRef = useRef<HTMLDivElement | null>(null);
  const phaseRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    // Scroll to the currently active phase card
    if (phaseRefs.current[currentPhase]) {
      setTimeout(() => {
        phaseRefs.current[currentPhase]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  }, [currentPhase]);

  useEffect(() => {
    // When planning starts, scroll to the assessment card first
    if (isPlanGenerated && assessmentRef.current) {
      setTimeout(() => {
        assessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [isPlanGenerated]);

  // Debug workflow stage changes
  useEffect(() => {
    console.log("Workflow stage changed to:", workflowStage);
    console.log("Dev phase:", devPhase);
  }, [workflowStage, devPhase]);

  // Mock state for Goal Assessment - dynamically update based on current phase
  const currentState = {
    project_defined: goal.length > 0,
    requirements_clear: currentPhase >= 1,
    agents_ready: currentPhase >= 1,
    architecture_planned: currentPhase >= 2,
    code_implemented: currentPhase >= 3,
  };

  const goalState = {
    project_defined: true,
    requirements_clear: true,
    agents_ready: true,
    architecture_planned: true,
    code_implemented: true,
    tests_written: true,
    code_reviewed: true,
    deployed: true,
  };

  const stateGaps = currentPhase === 0 ? [
    "Requirements need to be analyzed",
    "Architecture needs to be designed",
    "Implementation plan required",
    "Test strategy must be defined",
    "Deployment strategy needed",
  ] : currentPhase === 1 ? [
    "Architecture needs to be designed",
    "Implementation plan required",
    "Test strategy must be defined",
    "Deployment strategy needed",
  ] : currentPhase === 2 ? [
    "Implementation plan required",
    "Test strategy must be defined",
    "Deployment strategy needed",
  ] : currentPhase === 3 ? [
    "Test strategy must be defined",
    "Deployment strategy needed",
  ] : currentPhase === 4 ? [
    "Deployment strategy needed",
  ] : [];

  // Research phases - planning and analysis
  const researchPhases = [
    {
      title: "Goal Assessment",
      description: "Analyzing project requirements and current state",
      icon: Target,
      data: [
        { 
          text: "Parse coding objective", 
          icon: FileText,
          details: {
            objective: "Break down the goal into actionable components",
            agents: ["Research Agent"],
            effects: ["Requirements extracted", "Scope defined"],
          }
        },
        { 
          text: "Identify required technologies", 
          icon: Bot,
          details: {
            objective: "Determine which tools and frameworks are needed",
            agents: ["Research Agent"],
            effects: ["Tech stack identified", "Dependencies listed"],
          }
        },
        { 
          text: "Assess complexity & feasibility", 
          icon: GitBranch,
          details: {
            objective: "Evaluate technical challenges and effort estimation",
            agents: ["Research Agent"],
            effects: ["Complexity score calculated", "Risk assessment complete"],
          }
        },
      ],
      metrics: [
        { label: "Complexity", value: "Medium" },
        { label: "Estimated Time", value: "2-4 weeks" },
      ],
    },
    {
      title: "Architecture Planning",
      description: "Designing system structure and component interactions",
      icon: GitBranch,
      data: [
        { 
          text: "Research architecture patterns", 
          icon: Server,
          details: {
            objective: "Evaluate different architectural approaches",
            agents: ["Research Agent"],
            sources: ["Clean Architecture", "Microservices patterns", "Domain-Driven Design"],
            effects: ["Pattern selected", "Architecture outline created"],
          }
        },
        { 
          text: "Design API contracts", 
          icon: Code,
          details: {
            objective: "Specify endpoints, data models, and interfaces",
            agents: ["Research Agent"],
            effects: ["API spec drafted", "Request/response schemas defined"],
          }
        },
        { 
          text: "Plan database schema", 
          icon: Server,
          details: {
            objective: "Design data models and relationships",
            agents: ["Research Agent"],
            effects: ["ERD created", "Migration strategy planned"],
          }
        },
      ],
      metrics: [
        { label: "Components", value: "12" },
        { label: "API Endpoints", value: "8" },
      ],
    },
    {
      title: "Implementation Strategy",
      description: "Planning development approach and milestones",
      icon: Code,
      data: [
        { 
          text: "Define development phases", 
          icon: FileText,
          details: {
            objective: "Break down implementation into manageable phases",
            agents: ["Research Agent"],
            effects: ["Milestone roadmap created", "Dependencies mapped"],
          }
        },
        { 
          text: "Identify agent responsibilities", 
          icon: Bot,
          details: {
            objective: "Assign tasks to specialized development agents",
            agents: ["Research Agent"],
            effects: ["Agent roster finalized", "Task distribution planned"],
          }
        },
        { 
          text: "Research best practices", 
          icon: Shield,
          details: {
            objective: "Gather coding standards and security guidelines",
            agents: ["Research Agent"],
            sources: ["OWASP Top 10", "Industry standards", "Framework documentation"],
            effects: ["Guidelines documented", "Code patterns selected"],
          }
        },
      ],
      metrics: [
        { label: "Milestones", value: "5" },
        { label: "Agents", value: "6" },
      ],
    },
    {
      title: "Testing Strategy",
      description: "Planning quality assurance approach",
      icon: TestTube,
      data: [
        { 
          text: "Define test coverage goals", 
          icon: TestTube,
          details: {
            objective: "Set targets for unit, integration, and E2E tests",
            agents: ["Research Agent"],
            effects: ["Coverage targets set", "Test types identified"],
          }
        },
        { 
          text: "Research testing frameworks", 
          icon: Shield,
          details: {
            objective: "Evaluate testing tools and approaches",
            agents: ["Research Agent"],
            sources: ["Jest", "Vitest", "Testing Library", "Cypress"],
            effects: ["Testing stack selected", "Setup plan created"],
          }
        },
      ],
      metrics: [
        { label: "Target Coverage", value: "85%" },
        { label: "Test Types", value: "3" },
      ],
    },
    {
      title: "Deployment Planning",
      description: "Preparing production deployment strategy",
      icon: FileText,
      data: [
        { 
          text: "Research deployment options", 
          icon: Server,
          details: {
            objective: "Evaluate hosting platforms and CI/CD tools",
            agents: ["Research Agent"],
            sources: ["Vercel", "Netlify", "AWS", "GitHub Actions"],
            effects: ["Platform selected", "Deployment plan drafted"],
          }
        },
        { 
          text: "Plan monitoring & observability", 
          icon: Zap,
          details: {
            objective: "Define logging, metrics, and alerting strategy",
            agents: ["Research Agent"],
            effects: ["Monitoring plan created", "Tools selected"],
          }
        },
      ],
      metrics: [
        { label: "Services", value: "4" },
        { label: "Environments", value: "3" },
      ],
    },
  ];

  // Development phases - actual implementation
  const developmentPhases = [
    {
      title: "Project Setup",
      description: "Initializing codebase and dependencies",
      icon: FileText,
      data: [
        { 
          text: "Setup project structure", 
          icon: FileText,
          details: {
            objective: "Initialize repository with proper folder structure",
            agents: ["DevOps Agent"],
            files: ["package.json", "tsconfig.json", "vite.config.ts"],
            effects: ["Repo created", "Dependencies installed", "Build configured"],
          }
        },
        { 
          text: "Configure development environment", 
          icon: Server,
          details: {
            objective: "Setup linting, formatting, and dev tools",
            agents: ["DevOps Agent"],
            files: [".eslintrc", ".prettierrc", ".env.example"],
            effects: ["ESLint configured", "Prettier configured", "Git hooks added"],
          }
        },
      ],
      metrics: [
        { label: "Files Created", value: "12" },
        { label: "Dependencies", value: "24" },
      ],
    },
    {
      title: "Core Implementation",
      description: "Building main application features",
      icon: Code,
      data: [
        { 
          text: "Implement authentication module", 
          icon: Shield,
          details: {
            objective: "Build JWT-based auth with login/signup",
            agents: ["Implementation Agent"],
            files: ["auth.service.ts", "auth.controller.ts", "auth.middleware.ts"],
            effects: ["Auth endpoints created", "Token validation implemented", "Protected routes configured"],
            metrics: [
              { label: "Endpoints", value: "4" },
              { label: "LOC", value: "287" },
            ]
          }
        },
        { 
          text: "Build REST API endpoints", 
          icon: Server,
          details: {
            objective: "Create CRUD operations for core resources",
            agents: ["Implementation Agent"],
            files: ["users.controller.ts", "posts.controller.ts", "api.routes.ts"],
            effects: ["8 endpoints implemented", "Request validation added", "Error handling configured"],
            metrics: [
              { label: "Endpoints", value: "8" },
              { label: "LOC", value: "456" },
            ]
          }
        },
        { 
          text: "Integrate database layer", 
          icon: Server,
          details: {
            objective: "Connect to PostgreSQL and implement data access",
            agents: ["Implementation Agent"],
            files: ["database.config.ts", "user.model.ts", "post.model.ts"],
            effects: ["ORM configured", "Queries optimized", "Migrations created"],
            metrics: [
              { label: "Models", value: "5" },
              { label: "LOC", value: "504" },
            ]
          }
        },
      ],
      metrics: [
        { label: "Files", value: "42" },
        { label: "Total LOC", value: "1,247" },
      ],
    },
    {
      title: "Testing & Quality",
      description: "Validating code quality and functionality",
      icon: TestTube,
      data: [
        { 
          text: "Write unit tests", 
          icon: TestTube,
          details: {
            objective: "Create comprehensive test coverage",
            agents: ["Testing Agent"],
            files: ["auth.test.ts", "api.test.ts", "database.test.ts"],
            effects: ["87% coverage achieved", "Edge cases covered", "Mock data created"],
            metrics: [
              { label: "Test Files", value: "12" },
              { label: "Tests", value: "124" },
            ]
          }
        },
        { 
          text: "Run security analysis", 
          icon: Shield,
          details: {
            objective: "Scan for vulnerabilities and security issues",
            agents: ["Code Review Agent"],
            effects: ["0 critical issues", "2 minor warnings", "Security report generated"],
          }
        },
        { 
          text: "Code review", 
          icon: FileCheck,
          details: {
            objective: "Review code quality and best practices",
            agents: ["Code Review Agent"],
            effects: ["Code approved", "Minor refactoring suggested", "Documentation updated"],
          }
        },
      ],
      metrics: [
        { label: "Tests", value: "124" },
        { label: "Coverage", value: "87%" },
      ],
    },
    {
      title: "Documentation",
      description: "Creating comprehensive project documentation",
      icon: FileText,
      data: [
        { 
          text: "Generate API documentation", 
          icon: FileText,
          details: {
            objective: "Create comprehensive API docs with examples",
            agents: ["Documentation Agent"],
            files: ["openapi.yaml", "README.md", "API.md"],
            effects: ["OpenAPI spec generated", "Usage examples added", "Endpoint docs complete"],
          }
        },
        { 
          text: "Write developer guides", 
          icon: Code,
          details: {
            objective: "Document setup, development, and deployment processes",
            agents: ["Documentation Agent"],
            files: ["CONTRIBUTING.md", "DEPLOYMENT.md", "ARCHITECTURE.md"],
            effects: ["Setup guide written", "Architecture documented", "Contribution guidelines added"],
          }
        },
      ],
      metrics: [
        { label: "Documents", value: "8" },
        { label: "Pages", value: "24" },
      ],
    },
    {
      title: "Deployment",
      description: "Deploying to production environment",
      icon: Zap,
      data: [
        { 
          text: "Setup CI/CD pipeline", 
          icon: Zap,
          details: {
            objective: "Configure automated testing and deployment",
            agents: ["DevOps Agent"],
            files: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
            effects: ["GitHub Actions configured", "Auto-deploy enabled", "Environment secrets set"],
          }
        },
        { 
          text: "Deploy to production", 
          icon: Server,
          details: {
            objective: "Launch application to live environment",
            agents: ["DevOps Agent"],
            effects: ["App deployed", "Monitoring active", "Health checks passing"],
            metrics: [
              { label: "Uptime", value: "99.9%" },
              { label: "Response Time", value: "< 200ms" },
            ]
          }
        },
      ],
      metrics: [
        { label: "Environments", value: "3" },
        { label: "Status", value: "Live" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
              Coding Agent Swarm
            </h1>
            <p className="text-muted-foreground mt-2">
              Intelligent multi-agent system for collaborative software development
            </p>
          </div>
        </div>

        {/* Goal Input */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Coding Objective
                </CardTitle>
                <CardDescription>Define what you want the agent swarm to build</CardDescription>
              </div>
              <AdvancedSettingsModal />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="e.g., Build REST API with JWT authentication and PostgreSQL"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="flex-1"
              />
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleGeneratePlan}
                disabled={!goal.trim() || isRunning}
              >
                <Bot className="w-4 h-4" />
                {isPlanGenerated && !isRunning ? "Regenerate Plan" : "Generate Plan"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Research Phase */}
        {isPlanGenerated && workflowStage === "research" && (
          <div className="space-y-6">
            <div ref={assessmentRef} className="animate-fade-in">
              <StateAssessmentCard
                currentState={currentState}
                goalState={goalState}
                stateGaps={stateGaps}
                primaryColor="#a855f7"
                accentColor="#3b82f6"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Bot className="w-5 h-5 text-purple-500" />
                  Research Phase Progress
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-purple-500/10 text-purple-400 border-purple-500/50">
                    <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></span>
                    Researching...
                  </Badge>
                )}
              </div>
              <div className="space-y-4 relative">
                <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-green-500/50" 
                     style={{ 
                       height: `${shouldShowPhase(researchPhases.length - 1) ? '100%' : `${(currentPhase / researchPhases.length) * 100}%`}`,
                       transition: 'height 0.5s ease-out'
                     }} 
                />
                
                {researchPhases.map((phase, index) => 
                  shouldShowPhase(index) ? (
                    <div 
                      key={index}
                      ref={(el) => (phaseRefs.current[index] = el)}
                      className="animate-fade-in opacity-0"
                      style={{ 
                        animationDelay: `${(index * 200) + 300}ms`,
                        animationFillMode: "forwards"
                      }}
                    >
                      <AgentStep
                        title={phase.title}
                        description={phase.description}
                        icon={phase.icon}
                        status={getPhaseStatus(index)}
                        data={phase.data}
                        metrics={phase.metrics}
                        primaryColor="#a855f7"
                        accentColor="#3b82f6"
                        cardBackgroundColor="#1a1a1a"
                        cardBorderColor="#404040"
                        textColor="#ffffff"
                        secondaryTextColor="#a3a3a3"
                        successColor="#22c55e"
                        animationSpeed="normal"
                        compactMode={false}
                      />
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {workflowStage === "review" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Research Review</h3>
              {devPhase > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => setWorkflowStage("development")}
                  className="flex items-center gap-2"
                >
                  <Code className="w-4 h-4" />
                  Back to Development
                </Button>
              )}
            </div>
            
            {/* Tabs visible during review */}
            <Tabs defaultValue="dashboard" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="execution">Execution</TabsTrigger>
                <TabsTrigger value="quality">Quality</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard" className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      Research Summary
                    </h3>
                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/50">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Complete
                    </Badge>
                  </div>
                  
                  <div className="space-y-4 relative">
                    <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-green-500/50" />
                    
                    {researchPhases.map((phase, index) => (
                      <div key={index} className="animate-fade-in">
                        <AgentStep
                          title={phase.title}
                          description={phase.description}
                          icon={phase.icon}
                          status="completed"
                          data={phase.data}
                          metrics={phase.metrics}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-primary" />
                        Research Task Flow
                      </CardTitle>
                      <CardDescription>
                        Sequential research phases and their dependencies
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DependencyGraph />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Research Task Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {researchPhases.map((phase, index) => (
                          <div key={index} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">{phase.title}</h4>
                              <p className="text-sm text-muted-foreground mb-2">{phase.description}</p>
                              <div className="flex gap-2">
                                {phase.metrics?.map((metric, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {metric.label}: {metric.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="execution">
                <Tabs defaultValue="plan" className="space-y-4">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="plan">Research Plan</TabsTrigger>
                    <TabsTrigger value="activity">Agent Activity</TabsTrigger>
                    <TabsTrigger value="events">Event Timeline</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plan" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          Research Execution Plan
                        </CardTitle>
                        <CardDescription>
                          {researchPhases.length} Phases • All Completed • Goal: {goal}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <PlanVisualization
                          actions={researchPhases.map((phase, idx) => ({
                            id: String(idx + 1),
                            name: phase.title,
                            cost: 2 + idx,
                            description: phase.description
                          }))}
                          currentActionId={undefined}
                          completedActionIds={researchPhases.map((_, idx) => String(idx + 1))}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="activity">
                    <AgentActivityPanel
                      agents={[
                        { id: 'research', name: 'Research Agent', status: 'idle', type: 'Specialist' }
                      ]}
                      metrics={new Map([
                        ['research', {
                          tasksCompleted: researchPhases.length,
                          tasksActive: 0,
                          tasksFailed: 0,
                          avgCompletionTime: 5000,
                          totalTokens: 45000,
                          uptime: 40000
                        }]
                      ])}
                    />
                  </TabsContent>

                  <TabsContent value="events">
                    <RealTimeEventLog
                      events={researchPhases.map((phase, idx) => ({
                        type: 'STEP_COMPLETED',
                        timestamp: Date.now() - (researchPhases.length - idx) * 8000,
                        data: { step: phase.title, phase: idx + 1 }
                      }))}
                    />
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="quality">
                <div className="space-y-6">
                  <QualityGates metrics={{
                    compileCheck: true,
                    testCoverage: 100,
                    securityScore: 95
                  }} />

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Research Quality Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                          <div>
                            <h4 className="font-semibold">Completeness</h4>
                            <p className="text-sm text-muted-foreground">All phases completed successfully</p>
                          </div>
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
                            100%
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                          <div>
                            <h4 className="font-semibold">Coverage</h4>
                            <p className="text-sm text-muted-foreground">Architecture, implementation, testing & deployment</p>
                          </div>
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                            Complete
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                          <div>
                            <h4 className="font-semibold">Readiness</h4>
                            <p className="text-sm text-muted-foreground">Ready to proceed to development</p>
                          </div>
                          <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                            Ready
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="logs">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Research Execution Logs
                    </CardTitle>
                    <CardDescription>
                      Detailed logs from all research phases
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2 font-mono text-xs">
                        {researchPhases.flatMap((phase, phaseIdx) => [
                          <div key={`phase-${phaseIdx}-start`} className="text-blue-400">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000).toLocaleTimeString()}] ▶ Starting Phase {phaseIdx + 1}: {phase.title}
                          </div>,
                          ...phase.data.map((item, itemIdx) => (
                            <div key={`phase-${phaseIdx}-item-${itemIdx}`} className="ml-4 text-muted-foreground">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + itemIdx * 1000).toLocaleTimeString()}] • {item.text}
                            </div>
                          )),
                          ...phase.metrics.map((metric, metricIdx) => (
                            <div key={`phase-${phaseIdx}-metric-${metricIdx}`} className="ml-4 text-green-400">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + phase.data.length * 1000).toLocaleTimeString()}] ✓ {metric.label}: {metric.value}
                            </div>
                          )),
                          <div key={`phase-${phaseIdx}-complete`} className="text-green-500 font-semibold">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx - 1) * 8000).toLocaleTimeString()}] ✓ Phase {phaseIdx + 1} Complete
                          </div>,
                          <div key={`phase-${phaseIdx}-spacer`} className="h-2" />
                        ])}
                        <div className="text-green-500 font-bold mt-4">
                          [{new Date().toLocaleTimeString()}] ✓ All Research Phases Complete - Ready for Review
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <ResearchReviewCard
              goal={goal}
              onApprove={handleApproveResearch}
              onRevise={handleReviseResearch}
            />
          </div>
        )}

        {/* Development Phase */}
        {workflowStage === "development" && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Development Phase</h3>
              <Button 
                variant="outline" 
                onClick={() => setWorkflowStage("review")}
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                View Research Results
              </Button>
            </div>
            
            <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="execution">Execution</TabsTrigger>
              <TabsTrigger value="quality">Quality</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Code className="w-5 h-5 text-blue-500" />
                  Development Swarm Progress
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-blue-500/10 text-blue-400 border-blue-500/50">
                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                    Building...
                  </Badge>
                )}
              </div>
              <div className="space-y-4 relative">
                <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500/50 via-green-500/50 to-emerald-500/50" 
                     style={{ 
                       height: `${devPhase === developmentPhases.length ? '100%' : `${(devPhase / developmentPhases.length) * 100}%`}`,
                       transition: 'height 0.5s ease-out'
                     }} 
                />
                
                {developmentPhases.map((phase, index) => 
                  index <= devPhase ? (
                    <div 
                      key={index}
                      className="animate-fade-in opacity-0"
                      style={{ 
                        animationDelay: `${(index * 200) + 300}ms`,
                        animationFillMode: "forwards"
                      }}
                    >
                      <DevelopmentStep
                        title={phase.title}
                        description={phase.description}
                        icon={phase.icon}
                        status={index < devPhase ? "completed" : index === devPhase && isRunning ? "active" : index === devPhase ? "completed" : "pending"}
                        data={phase.data}
                        metrics={phase.metrics}
                      />
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            <div className="space-y-6">
              <TaskBoard swarmMode={swarmMode} />
              
              {/* Task Dependencies */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-primary" />
                    Task Dependencies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DependencyGraph />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="execution">
            <Tabs defaultValue="plan" className="space-y-4">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="plan">Execution Plan</TabsTrigger>
                <TabsTrigger value="current">Current Step</TabsTrigger>
                <TabsTrigger value="activity">Agent Activity</TabsTrigger>
                <TabsTrigger value="events">Event Log</TabsTrigger>
              </TabsList>

              {/* Execution Plan */}
              <TabsContent value="plan" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          Execution Plan
                        </CardTitle>
                        <CardDescription className="mt-1">
                          5 Actions • Cost: 15 • Est. 8m
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Graph View</Button>
                        <Button variant="outline" size="sm">Timeline View</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PlanVisualization
                      actions={[
                        { id: '1', name: 'Setup Architecture', cost: 3, description: 'Define system design' },
                        { id: '2', name: 'Design API', cost: 2, description: 'Specify endpoints' },
                        { id: '3', name: 'Implement Backend', cost: 5, description: 'Build REST API' },
                        { id: '4', name: 'Write Tests', cost: 4, description: 'Create test suite' },
                        { id: '5', name: 'Deploy', cost: 1, description: 'Launch to production' }
                      ]}
                      currentActionId={currentPhase > 0 ? String(Math.min(currentPhase, 5)) : undefined}
                      completedActionIds={Array.from({ length: Math.max(0, currentPhase - 1) }, (_, i) => String(i + 1))}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Current Step */}
              <TabsContent value="current" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Current Step</CardTitle>
                            <CardDescription>
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title || 'Planning'}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleStartSwarm} disabled={isRunning}>
                              <Play className="w-4 h-4 mr-1" />
                              Resume
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setCurrentPhase(Math.min(currentPhase + 1, researchPhases.length))}>
                              <SkipForward className="w-4 h-4 mr-1" />
                              Skip
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              setCurrentPhase(Math.max(0, currentPhase - 1));
                              setIsRunning(true);
                            }}>
                              <RotateCw className="w-4 h-4 mr-1" />
                              Retry
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-semibold mb-2">
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              Cost: {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.data?.[0]?.details?.objective}
                            </p>
                            <p className="text-sm">
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description}
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">Preconditions</h4>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>initialized: true</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>requirements_clear: true</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">Effects</h4>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>architecture_defined: true</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>api_designed: true</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Execution Log</h4>
                            <ScrollArea className="h-[120px] rounded border bg-muted/50 p-3">
                              <div className="space-y-1 font-mono text-xs">
                                <div>[2:49:25 PM] Starting architecture planning...</div>
                                <div>[2:49:25 PM] Analyzing requirements...</div>
                                <div>[2:49:25 PM] Generating system design...</div>
                              </div>
                            </ScrollArea>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <StepExecutionPanel
                    currentAction={{
                      name: researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title || 'Planning',
                      description: researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description,
                      cost: 3,
                      preconditions: { initialized: true, requirements_clear: true },
                      effects: { architecture_defined: true, api_designed: true }
                    }}
                    assignedAgent={{
                      name: agents[Math.min(currentPhase - 1, agents.length - 1)]?.name || 'Architecture Agent',
                      type: 'Specialist',
                      status: isRunning ? 'working' : 'idle'
                    }}
                    progress={isRunning ? 65 : 0}
                    logs={[
                      'Starting architecture planning...',
                      'Analyzing requirements...',
                      'Generating system design...'
                    ]}
                    isPaused={!isRunning}
                    onPause={() => setIsRunning(false)}
                    onResume={() => setIsRunning(true)}
                  />
                </div>
              </TabsContent>

              {/* Agent Activity */}
              <TabsContent value="activity">
                <AgentActivityPanel
                  agents={agents.map(a => ({ ...a, type: 'Specialist' }))}
                  metrics={new Map(agents.map(a => [
                    a.id,
                    {
                      tasksCompleted: Math.floor(Math.random() * 10),
                      tasksActive: a.status === 'working' ? 1 : 0,
                      tasksFailed: 0,
                      avgCompletionTime: 2500,
                      totalTokens: 15000,
                      uptime: 3600000
                    }
                  ]))}
                />
              </TabsContent>

              {/* Event Log */}
              <TabsContent value="events">
                <RealTimeEventLog
                  events={[
                    { type: 'PLAN_GENERATED', timestamp: Date.now() - 5000, data: { actions: 5 } },
                    { type: 'AGENT_STARTED', timestamp: Date.now() - 4000, data: { agent: 'Architecture' } },
                    { type: 'STEP_COMPLETED', timestamp: Date.now() - 2000, data: { step: 'Analysis' } }
                  ]}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

            <TabsContent value="quality">
              <QualityGates metrics={qualityMetrics} />
            </TabsContent>

            <TabsContent value="logs">
              <CommunicationLog />
            </TabsContent>
          </Tabs>
          </div>
        )}

        {/* Placeholder when plan not generated */}
        {!isPlanGenerated && (
          <Card className="border-2 border-dashed border-primary/20">
            <CardContent className="py-12 text-center">
              <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2 text-muted-foreground">
                Ready to Plan
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Enter a coding objective above and click "Generate Plan" to see the agent swarm in action
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Example: "Build REST API with JWT authentication and PostgreSQL"</p>
                <p>Example: "Create a React dashboard with charts and real-time data"</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
