import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizeConfigRequest {
  preset: string;
  currentGoal?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { preset, currentGoal }: OptimizeConfigRequest = await req.json();
    
    console.log('Optimize config request:', { preset, currentGoal });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert research workflow architect specializing in GOAP (Goal-Oriented Action Planning) configuration optimization.

Generate optimized research configuration settings based on the given preset/objective. Your configuration should maximize research effectiveness for the specific use case.

Consider:
- Research depth appropriate for the objective
- Source types and quality thresholds matching the domain
- Execution parameters balancing speed and thoroughness
- Perspective and focus areas relevant to the preset
- GOAP settings for optimal planning and replanning

Be specific and practical - these settings will directly control AI research behavior.`;

    const presetPrompts: Record<string, string> = {
      'academic-deep': `Optimize for: Academic/Scientific Deep Research
      - Maximum depth and rigor
      - Academic and peer-reviewed sources prioritized
      - High confidence thresholds (90%+)
      - Comprehensive analysis with extensive cross-referencing
      - Focus: Methodology, citations, reproducibility
      - Timeframe: Include seminal works, not just recent
      Goal: ${currentGoal || 'Scientific research with publication-grade rigor'}`,

      'industry-quick': `Optimize for: Industry Quick Scan
      - Speed and actionable insights prioritized
      - Industry reports, market data, business sources
      - Moderate confidence acceptable (75%+)
      - Surface to moderate depth
      - Focus: Practical applications, ROI, trends
      - Timeframe: Recent only (past 6-12 months)
      Goal: ${currentGoal || 'Fast industry insights for business decisions'}`,

      'competitive-analysis': `Optimize for: Competitive Intelligence & Analysis
      - Comprehensive competitor research
      - Industry reports, news, company filings, social media
      - Focus: Market positioning, strategies, strengths/weaknesses
      - Moderate to deep depth
      - Business and strategic perspective
      - Parallel execution for multiple competitors
      Goal: ${currentGoal || 'Competitive landscape analysis'}`,

      'technical-feasibility': `Optimize for: Technical Feasibility Study
      - Technical and engineering focus
      - Academic papers, technical documentation, GitHub
      - Deep analysis of implementation details
      - Focus: Architecture, performance, limitations, trade-offs
      - High confidence for technical claims (85%+)
      - Technical perspective with practical considerations
      Goal: ${currentGoal || 'Technical implementation feasibility assessment'}`,

      'market-trends': `Optimize for: Market Trends & Predictions
      - Trend analysis and future predictions
      - Industry reports, market research, financial data
      - Focus: Growth patterns, emerging opportunities, disruptions
      - Moderate depth with broad coverage
      - Business and analytical perspective
      - Recent timeframe with historical context
      Goal: ${currentGoal || 'Market trend analysis and forecasting'}`,

      'medical-clinical': `Optimize for: Medical/Clinical Research
      - Medical journals, clinical trials, PubMed prioritized
      - Very high confidence required (90%+)
      - Deep analysis with safety/efficacy focus
      - Focus: Clinical evidence, patient outcomes, safety profiles
      - Academic and clinical perspective
      - Exclude non-peer-reviewed sources
      Goal: ${currentGoal || 'Clinical research with evidence-based analysis'}`,

      'startup-validation': `Optimize for: Startup/Business Idea Validation
      - Market size, competition, customer needs
      - Industry reports, surveys, competitor analysis
      - Practical and business perspective
      - Focus: Market gaps, validation metrics, go-to-market
      - Moderate depth, broad coverage
      - Cost-effective with parallel research
      Goal: ${currentGoal || 'Startup idea validation and market assessment'}`,

      'policy-regulatory': `Optimize for: Policy & Regulatory Research
      - Government sources, legal documents, policy papers
      - High accuracy and recency critical
      - Focus: Compliance, legal frameworks, regulatory trends
      - Deep analysis with risk assessment
      - Academic and legal perspective
      - Exclude opinion pieces, prioritize official sources
      Goal: ${currentGoal || 'Policy and regulatory compliance research'}`
    };

    const userPrompt = presetPrompts[preset.toLowerCase()] || `Optimize research settings for: ${preset}. Goal: ${currentGoal || 'general research'}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_optimized_config",
              description: "Generate optimized research configuration for the given preset",
              parameters: {
                type: "object",
                properties: {
                  researchGuidance: {
                    type: "object",
                    properties: {
                      focusAreas: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "Specific topics to emphasize (2-4 items)"
                      },
                      excludeTopics: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "Topics to avoid (0-3 items)"
                      },
                      depth: { 
                        type: "string", 
                        enum: ["surface", "moderate", "deep"],
                        description: "Research depth level"
                      },
                      perspective: { 
                        type: "string",
                        description: "Research perspective (technical/business/academic/practical)"
                      },
                      timeframe: { 
                        type: "string",
                        description: "Time focus (recent/current-year/past-year/past-2-years/all-time)"
                      }
                    },
                    required: ["depth", "perspective", "timeframe"]
                  },
                  prompts: {
                    type: "object",
                    properties: {
                      systemPrompt: { 
                        type: "string",
                        description: "Custom system prompt for AI (2-3 paragraphs)"
                      }
                    }
                  },
                  parameters: {
                    type: "object",
                    properties: {
                      maxSources: { 
                        type: "number",
                        minimum: 5,
                        maximum: 25,
                        description: "Number of sources per step"
                      },
                      minConfidence: { 
                        type: "number",
                        minimum: 70,
                        maximum: 95,
                        description: "Minimum confidence threshold (%)"
                      },
                      maxSteps: { 
                        type: "number",
                        minimum: 5,
                        maximum: 10,
                        description: "Maximum research steps"
                      },
                      parallelAgents: { 
                        type: "number",
                        minimum: 1,
                        maximum: 5,
                        description: "Number of parallel agents"
                      },
                      timeout: { 
                        type: "number",
                        minimum: 60,
                        maximum: 300,
                        description: "Timeout in seconds"
                      }
                    },
                    required: ["maxSources", "minConfidence", "maxSteps"]
                  },
                  filters: {
                    type: "object",
                    properties: {
                      dateRange: { 
                        type: "string",
                        description: "Date range filter (recent/current-year/past-year/past-2-years/all-time)"
                      },
                      sourceTypes: { 
                        type: "array",
                        items: { type: "string" },
                        description: "Preferred source types (academic/technical/industry/news)"
                      },
                      excludeDomains: { 
                        type: "array",
                        items: { type: "string" },
                        description: "Domains to exclude (0-3 items)"
                      }
                    },
                    required: ["dateRange", "sourceTypes"]
                  },
                  goapConfig: {
                    type: "object",
                    properties: {
                      executionMode: { 
                        type: "string",
                        enum: ["focused", "closed", "open"],
                        description: "GOAP execution mode"
                      },
                      enableReplanning: { 
                        type: "boolean",
                        description: "Enable adaptive replanning"
                      },
                      costOptimization: { 
                        type: "boolean",
                        description: "Optimize for cost efficiency"
                      },
                      parallelExecution: { 
                        type: "boolean",
                        description: "Enable parallel agent execution"
                      }
                    },
                    required: ["executionMode", "enableReplanning"]
                  }
                },
                required: ["researchGuidance", "parameters", "filters", "goapConfig"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_optimized_config" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const config = JSON.parse(toolCall.function.arguments);
    console.log('Generated optimized config:', config);

    return new Response(JSON.stringify({ config }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in optimize-research-config function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to optimize research configuration'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
