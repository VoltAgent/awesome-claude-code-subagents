import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchConfig {
  researchGuidance?: {
    focusAreas: string[];
    excludeTopics: string[];
    depth: "surface" | "moderate" | "deep";
    perspective: string;
    timeframe: string;
  };
  prompts?: {
    systemPrompt: string;
    searchQueryTemplate: string;
    analysisPrompt: string;
    synthesisPrompt: string;
  };
  parameters?: {
    maxSources: number;
    minConfidence: number;
    maxSteps: number;
    parallelAgents: number;
    timeout: number;
  };
  filters?: {
    dateRange: string;
    sourceTypes: string[];
    languages: string[];
    excludeDomains: string[];
  };
}

interface ResearchRequest {
  goal: string;
  stepTitle: string;
  stepDescription: string;
  stepType: string;
  aiModel?: string;
  config?: ResearchConfig;
  previousStepsData?: Array<{
    stepTitle: string;
    data: ResearchDataItem[];
  }>;
}

interface ResearchDataItem {
  id: string;
  title: string;
  content: string;
  source?: string;
  confidence?: number;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, stepTitle, stepDescription, stepType, aiModel, config, previousStepsData }: ResearchRequest = await req.json();
    
    console.log('Research request:', { 
      goal, 
      stepTitle, 
      stepDescription, 
      stepType, 
      aiModel, 
      previousStepsCount: previousStepsData?.length || 0,
      configProvided: !!config,
      depth: config?.researchGuidance?.depth,
      perspective: config?.researchGuidance?.perspective,
      focusAreas: config?.researchGuidance?.focusAreas?.length || 0
    });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Use custom system prompt if provided, otherwise use default
    const defaultSystemPrompt = `You are a senior research analyst with expertise in conducting comprehensive research and generating substantive findings.

CRITICAL INSTRUCTIONS:
- You MUST provide ACTUAL research findings, not task descriptions
- Include specific data points, statistics, percentages, and numbers
- Reference real-world developments, breakthroughs, or trends
- Provide concrete examples, case studies, or citations
- Generate findings as if you just completed real research

BAD EXAMPLE (task description): "Analyze quantum computing developments"
GOOD EXAMPLE (actual finding): "Google's Willow quantum chip achieved breakthrough in quantum error correction using surface codes with 99.9% fidelity (Nature Physics, Dec 2024), reducing error rates by 50% compared to previous generation."

BAD EXAMPLE: "Identify market opportunities"  
GOOD EXAMPLE: "Quantum computing market projected to reach $125B by 2030 (McKinsey, 2024), with pharmaceutical simulation representing 38% of near-term revenue. Key opportunity: NISQ algorithms for drug discovery showing 10x speedup over classical methods."

Your findings must be SPECIFIC, DETAILED, and SUBSTANTIVE.`;

    // Apply research depth modifier
    const depthModifier = config?.researchGuidance?.depth === 'deep' 
      ? '\n\nDEPTH: Provide comprehensive, in-depth analysis with extensive details, multiple examples, and thorough exploration of nuances (7-10 sentences per finding).'
      : config?.researchGuidance?.depth === 'surface'
      ? '\n\nDEPTH: Provide concise, high-level overview with key points only (2-3 sentences per finding).'
      : '\n\nDEPTH: Provide balanced analysis with solid detail and examples (4-5 sentences per finding).';
    
    // Apply perspective modifier
    const perspectiveModifier = config?.researchGuidance?.perspective 
      ? `\n\nPERSPECTIVE: Approach this research from a ${config.researchGuidance.perspective} perspective, focusing on relevant aspects for that viewpoint.`
      : '';

    // Apply focus areas guidance
    const focusAreasModifier = config?.researchGuidance?.focusAreas && config.researchGuidance.focusAreas.length > 0
      ? `\n\nFOCUS AREAS: Emphasize these specific topics: ${config.researchGuidance.focusAreas.join(', ')}`
      : '';

    // Apply exclude topics guidance  
    const excludeTopicsModifier = config?.researchGuidance?.excludeTopics && config.researchGuidance.excludeTopics.length > 0
      ? `\n\nEXCLUDE: Do NOT include information about: ${config.researchGuidance.excludeTopics.join(', ')}`
      : '';

    const systemPrompt = (config?.prompts?.systemPrompt || defaultSystemPrompt) 
      + depthModifier 
      + perspectiveModifier 
      + focusAreasModifier
      + excludeTopicsModifier;
    
    // Build context from previous steps
    let previousContext = '';
    if (previousStepsData && previousStepsData.length > 0) {
      previousContext = '\n\nPREVIOUS RESEARCH FINDINGS (build upon these):\n';
      previousStepsData.forEach((step, idx) => {
        previousContext += `\n${step.stepTitle}:\n`;
        step.data.forEach((item) => {
          previousContext += `• ${item.title}: ${item.content}\n`;
        });
      });
      previousContext += '\n**Your findings must reference and extend these previous discoveries.**\n';
    }
    
    // Special handling for final report - provide answer-focused synthesis
    const isFinalReport = stepType === "final-report";
    
    const userPrompt = isFinalReport ? `
RESEARCH GOAL: ${goal}
${previousContext}

Based on ALL the research findings above, generate 3-5 SPECIFIC, ACTIONABLE RECOMMENDATIONS that directly answer the research goal.

CRITICAL: Your response must ANSWER THE QUESTION, not just summarize research steps.

For example, if the goal is "best family car in 2025 ontario canada":
- BAD: "Analysis of search queries shows SUV dominance"
- GOOD: "Honda CR-V Hybrid 2025 - Best Overall Family SUV for Ontario. Offers AWD for winter driving, 40 MPG fuel efficiency, and excellent safety ratings (IIHS Top Safety Pick+). Price: $38,000 CAD. Resale value after 5 years: 65% (highest in class)."

Each recommendation MUST include:

1. **title**: Specific recommendation or answer (not a task or analysis description)
   - If recommending a product: Include model name/year
   - If recommending an action: State the specific action
   - If answering a question: Provide the direct answer
   - Examples: "2025 Toyota Sienna Hybrid - Best Family Minivan", "Implement Zero-Trust Architecture with Cloudflare Access", "Yes, quantum computing is commercially viable for drug discovery"

2. **content**: DETAILED justification with specifics (minimum 5-6 sentences):
   - WHY this recommendation answers the goal
   - SPECIFIC data from research findings (reference previous steps)
   - Key benefits with quantified metrics
   - Practical considerations or trade-offs
   - Supporting evidence from research
   - Examples:
     * "The 2025 Toyota Sienna Hybrid dominates the minivan segment in Ontario based on multiple criteria from our research. It features AWD (critical for Ontario winters per our State Assessment findings), achieving 36 MPG combined fuel economy which translates to approximately $1,200 annual fuel savings vs non-hybrid competitors. Safety analysis revealed it earned IIHS Top Safety Pick+ with standard Toyota Safety Sense 3.0. Our Document Analysis phase identified its superior reliability rating (4.5/5 Consumer Reports) and strongest resale value in class at 58% after 5 years. Starting MSRP of $42,500 CAD positions it competitively while our Web Search findings show average dealer discounts of $2,000 in Ontario markets."

3. **source**: Real source from research OR credible industry source
   - Reference findings from previous research steps when applicable
   - Examples: "Web Search findings + Consumer Reports 2024", "Document Analysis + edmunds.com", "Knowledge Synthesis + Motor Trend 2025 Buyer's Guide"

4. **confidence**: 0.80-0.95 based on research depth

REMEMBER: The user wants ANSWERS, not research summaries. Be specific, actionable, and directly address their goal.

Format:
{
  "title": "Specific Recommendation/Answer [directly addressing ${goal}]",
  "content": "Detailed justification with data from research findings, benefits, metrics, and practical advice...",
  "source": "Source from research OR industry authority (Year)",
  "confidence": 0.88
}` : `
RESEARCH GOAL: ${goal}
CURRENT ANALYSIS STEP: ${stepTitle}
STEP OBJECTIVE: ${stepDescription}
${previousContext}

Generate ${config?.parameters?.maxSources ? `up to ${config.parameters.maxSources}` : '3-5'} ACTUAL research findings with substantive content. Each finding MUST include:

1. **title**: Specific discovery or insight (what was found, not what to find)
   - Include key metrics, names, or breakthrough details in the title
   - Examples: "IBM's 433-Qubit Osprey Processor Achieves Quantum Advantage", "87% of Fortune 500 Investing in AI Infrastructure"

2. **content**: DETAILED research findings (${config?.researchGuidance?.depth === 'deep' ? '7-10 sentences' : config?.researchGuidance?.depth === 'surface' ? '2-3 sentences' : '4-5 sentences'} minimum):
   - Start with the core finding and supporting data
   - Include specific numbers, percentages, or metrics
   - Mention real companies, technologies, or research when relevant
   - Explain implications and significance
   - Reference previous step findings to show progression
   - Examples:
     * "IBM's latest 433-qubit Osprey processor demonstrated quantum advantage in solving optimization problems 120x faster than classical supercomputers (IBM Research, Nov 2024). The system achieved 99.7% two-qubit gate fidelity using dynamic error suppression. This breakthrough enables practical applications in logistics optimization, with DHL reporting 15% cost reduction in route planning trials. The technology utilizes heavy-hexagonal qubit topology for improved connectivity."
     * "Analysis of 156 quantum computing research papers (2023-2024) reveals strong consensus on topological qubits as the most promising path to fault-tolerant quantum computing. Current limitations include decoherence times averaging 85 microseconds and error rates of 0.1% for two-qubit gates. Leading institutions (Google, IBM, IonQ) are converging on surface code implementations, with projections suggesting 1000+ logical qubit systems by 2027."

3. **source**: REQUIRED - Credible source with year (MUST be provided for every finding)
   - Examples: "Nature Physics (2024)", "McKinsey Quantum Report 2024", "IEEE Quantum Computing Survey (Dec 2024)"
   - Use Google Search grounding to find real sources
   - ${config?.filters?.sourceTypes && config.filters.sourceTypes.length > 0 
      ? `Prioritize these source types: ${config.filters.sourceTypes.join(', ')}` 
      : 'If no specific source available, use: "Industry Analysis (2024)" or "Market Research (2024)"'}
   - ${config?.filters?.excludeDomains && config.filters.excludeDomains.length > 0
      ? `DO NOT use sources from these domains: ${config.filters.excludeDomains.join(', ')}`
      : ''}

4. **confidence**: REQUIRED - Realistic score ${config?.parameters?.minConfidence ? `${config.parameters.minConfidence / 100}-0.95` : '0.7-0.95'} based on finding specificity

CRITICAL REQUIREMENTS:
- DO NOT generate generic task descriptions like "Analyze X" or "Identify Y"
- Generate ACTUAL findings as if research was just completed, with real data and insights
- EVERY finding MUST have a source citation - this is non-negotiable
- Use Google Search results to find real, current information specific to the query
- ONLY include information that is directly relevant to: "${goal || stepTitle}"
- DO NOT include unrelated topics (e.g., quantum computing when researching marketing trends)
- Verify each finding relates to the actual research goal before including it
${config?.filters?.dateRange ? `\n- Focus on information from: ${config.filters.dateRange}` : ''}

IMPORTANT: Every finding MUST:
1. Be directly relevant to the research goal: "${goal || stepTitle}"
2. Include a source citation from Google Search results
3. Contain current, verifiable information
4. ${config?.parameters?.minConfidence ? `Meet minimum confidence threshold of ${config.parameters.minConfidence}%` : 'Have realistic confidence score'}

Format (all fields required):
{
  "title": "Specific Finding with Key Metric [directly related to ${goal || stepTitle}]",
  "content": "Detailed research findings with data, examples, implications...",
  "source": "Source Name (Year)", // REQUIRED - NEVER omit this
  "confidence": ${config?.parameters?.minConfidence ? (config.parameters.minConfidence / 100) : 0.85} // REQUIRED - Must be between ${config?.parameters?.minConfidence ? `${config.parameters.minConfidence / 100}` : '0.7'} and 0.95
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "google_search_retrieval",
            google_search_retrieval: {
              dynamic_retrieval_config: {
                mode: "MODE_DYNAMIC",
                dynamic_threshold: 0.3
              }
            }
          },
          {
            type: "function",
            function: {
              name: "generate_research_data",
              description: "Generate research data items for the given step based on current web search results",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "Specific finding with key metrics or breakthrough details"
                        },
                        content: { 
                          type: "string",
                          description: "Detailed research findings with data, examples, and implications (4-5 sentences minimum)"
                        },
                        source: { 
                          type: "string",
                          description: "REQUIRED: Credible source with year (e.g., 'Nature Physics (2024)', 'McKinsey Report 2024')"
                        },
                        confidence: { 
                          type: "number", 
                          minimum: config?.parameters?.minConfidence ? (config.parameters.minConfidence / 100) : 0.7, 
                          maximum: 0.95,
                          description: "Confidence score based on finding specificity"
                        }
                      },
                      required: ["title", "content", "source", "confidence"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["items"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_research_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('Rate limit exceeded');
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        console.error('Payment required');
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
    console.log('AI response received:', data);

    // Extract grounding metadata (citations from Google Search)
    const groundingMetadata = data.choices?.[0]?.message?.grounding_metadata;
    const groundingSources = groundingMetadata?.search_entry_point?.rendered_content || 
                            groundingMetadata?.grounding_supports?.map((s: any) => ({
                              url: s.segment?.text || s.source?.uri,
                              title: s.source?.title
                            })) || [];
    
    console.log('Grounding sources:', groundingSources);

    // Extract structured data from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const researchItems = JSON.parse(toolCall.function.arguments).items;

    // Transform to match the expected interface and enrich with grounding citations
    const formattedData: ResearchDataItem[] = researchItems.map((item: any, index: number) => {
      // If the item doesn't have a source, try to use grounding sources
      let source = item.source;
      if (!source && groundingSources.length > index) {
        const groundingSource = groundingSources[index];
        source = groundingSource.title || groundingSource.url || 'Google Search';
      }
      
      return {
        id: `${stepType}-${Date.now()}-${index}`,
        title: item.title,
        content: item.content,
        source: source || 'Research Analysis',
        confidence: item.confidence || undefined,
        timestamp: new Date().toISOString(),
      };
    });

    console.log('Formatted research data with citations:', formattedData);

    return new Response(JSON.stringify(formattedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in research-step function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to generate research data'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

