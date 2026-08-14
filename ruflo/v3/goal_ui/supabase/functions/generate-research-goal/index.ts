import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateGoalRequest {
  category: string;
  customContext?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, customContext }: GenerateGoalRequest = await req.json();
    
    console.log('Generate research goal request:', { category, customContext });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert research consultant and futurist who helps formulate cutting-edge, innovative research objectives that push boundaries.

Generate 3 HIGHLY DIVERSE and NOVEL research goals for the given category. Each goal should be:
- Innovative and forward-thinking (explore emerging trends, novel applications, or unconventional angles)
- Specific and actionable (clear research direction, not vague exploration)
- Current and relevant to 2024-2025 cutting-edge developments
- Professionally articulated with compelling detail
- DIFFERENT from each other (vary the approach, scale, application, or methodology)
- Boundary-pushing (challenge conventional thinking, explore unexplored intersections)

CRITICAL: Generate VARIETY across the 3 goals by varying:
- Scale (micro vs macro, individual vs enterprise vs societal)
- Application domain (different industries, use cases, or contexts)
- Approach (technical implementation, business impact, ethical considerations, future predictions)
- Time horizon (near-term practical vs long-term transformative)

Examples of EXCELLENT diverse research goals for AI & ML:
1. "Investigate the emergence of spontaneous goal-formation in multi-agent reinforcement learning systems deployed in competitive market simulations, focusing on measuring agency, cooperation patterns, and alignment drift over 10,000+ iteration cycles"
2. "Analyze the ethical and regulatory frameworks needed for autonomous AI agents conducting financial trading with self-evolving risk strategies, examining liability models and human oversight mechanisms"
3. "Research hybrid neurosymbolic architectures that combine LLMs with symbolic reasoning engines to solve multi-step mathematical proofs, benchmarking against GPT-5 and human mathematicians"

Examples of POOR goals (too generic, not novel):
- "Study machine learning applications in healthcare"
- "Research neural network optimization techniques"
- "Investigate AI ethics and bias"

Push the boundaries. Be specific. Be innovative.`;

    const categoryPrompts: Record<string, string> = {
      'finance': 'Generate 3 cutting-edge, diverse research goals for finance. Vary across: (1) emerging technologies (crypto, DeFi, AI trading), (2) novel market mechanisms or regulations, (3) behavioral/psychological aspects or systemic risks. Include specific metrics, timeframes, or novel applications. Examples: algorithmic stablecoin mechanisms, neurofinance trading patterns, tokenized real estate liquidity.',
      
      'business': 'Generate 3 innovative, diverse research goals for business. Vary across: (1) emerging business models or platforms, (2) organizational transformation or culture, (3) data-driven decision making or automation. Be specific about industry, scale, and measurable outcomes. Examples: DAO governance for enterprises, AI-augmented strategic planning, remote-first organizational psychology.',
      
      'marketing': 'Generate 3 boundary-pushing, diverse research goals for marketing. Vary across: (1) emerging channels or technologies (AI, AR/VR, Web3), (2) behavioral science or psychology, (3) measurement or attribution innovation. Include specific platforms, demographics, or novel approaches. Examples: neuromarketing with eye-tracking AI, decentralized creator economies, predictive CLV using graph neural networks.',
      
      'medical': 'Generate 3 cutting-edge, diverse research goals for medical/healthcare. Vary across: (1) emerging diagnostic or treatment technologies, (2) healthcare delivery or access innovations, (3) personalized/precision medicine or AI applications. Be specific about conditions, populations, or technologies. Examples: AI-discovered antibiotics using protein folding, CRISPR germline editing ethics, digital therapeutics efficacy for mental health.',
      
      'education': 'Generate 3 innovative, diverse research goals for education. Vary across: (1) emerging pedagogical technologies (AI tutors, VR, adaptive learning), (2) learning science or cognitive research, (3) educational equity or accessibility. Include specific age groups, subjects, or measurable learning outcomes. Examples: AI-generated personalized curricula, VR historical immersion effectiveness, neuroplasticity-optimized learning schedules.',
      
      'technical': 'Generate 3 cutting-edge, diverse research goals for technical/engineering. Vary across: (1) emerging architectures or paradigms, (2) performance or efficiency breakthroughs, (3) security or reliability innovations. Be specific about technologies, metrics, or novel approaches. Examples: quantum-resistant cryptography migration paths, edge AI model compression techniques, chaos engineering for distributed systems.',
      
      'coding': 'Generate 3 innovative, diverse research goals for coding/software development. Vary across: (1) emerging languages, frameworks, or paradigms, (2) AI-assisted development or automation, (3) code quality, testing, or collaboration tools. Include specific technologies or measurable productivity gains. Examples: LLM-powered automated test generation, effect systems for safer concurrency, AI code review for security vulnerabilities.',
      
      'ai-ml': 'Generate 3 CUTTING-EDGE, diverse research goals for AI, Machine Learning, and Autonomous Agents. MUST vary across: (1) agentic AI systems (multi-agent coordination, autonomous decision-making, goal-seeking behavior, emergent agency), (2) novel architectures or training paradigms (neurosymbolic, multimodal fusion, self-improving systems), (3) real-world applications or societal implications (alignment, safety, ethics, transformative capabilities). Be SPECIFIC about agent behaviors, architectural innovations, or measurable capabilities. Push boundaries with novel intersections. Examples: "Measure spontaneous tool-use emergence in LLM agents given only raw API documentation", "Benchmark multi-agent negotiation protocols in adversarial trading environments with evolving objectives", "Investigate constitutional AI approaches for value alignment in self-modifying agent systems", "Analyze swarm intelligence patterns in distributed AI agents solving NP-hard optimization problems".',
      
      'custom': `Generate 3 innovative, boundary-pushing research goals based on: ${customContext || 'general cutting-edge research topics'}. Make them specific, actionable, and explore novel angles or unconventional applications.`
    };

    const userPrompt = categoryPrompts[category.toLowerCase()] || categoryPrompts['custom'];

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
              name: "generate_goals",
              description: "Generate 3 specific research goals for the given category",
              parameters: {
                type: "object",
                properties: {
                  goals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "A concise, specific research goal (1-2 sentences max)"
                        },
                        category: {
                          type: "string",
                          description: "The category this goal belongs to"
                        }
                      },
                      required: ["title", "category"],
                      additionalProperties: false
                    },
                    minItems: 3,
                    maxItems: 3
                  }
                },
                required: ["goals"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_goals" } }
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
    console.log('AI response received');

    // Extract structured data from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    const goals = result.goals.map((g: any) => g.title);

    console.log('Generated goals:', goals);

    return new Response(JSON.stringify({ goals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-research-goal function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to generate research goals'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
