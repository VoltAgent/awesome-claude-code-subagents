import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActionItemsRequest {
  goal: string;
  researchContext: Array<{
    stepTitle: string;
    findings: Array<{
      title: string;
      content: string;
      source?: string;
    }>;
  }>;
  totalSteps: number;
  totalDataPoints: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, researchContext, totalSteps, totalDataPoints }: ActionItemsRequest = await req.json();
    
    console.log('Generating action items for goal:', goal);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build research summary from all steps
    let researchSummary = '';
    researchContext.forEach(step => {
      researchSummary += `\n${step.stepTitle}:\n`;
      step.findings.forEach(finding => {
        researchSummary += `• ${finding.title}: ${finding.content}\n`;
        if (finding.source) researchSummary += `  Source: ${finding.source}\n`;
      });
    });

    const systemPrompt = `You are an expert strategic planner and implementation consultant. Generate contextual, actionable recommendations based on research findings.

CRITICAL INSTRUCTIONS:
- Generate action items that are DIRECTLY RELEVANT to the research goal
- Base recommendations on ACTUAL research findings provided
- Do NOT use generic "pilot program" or "scale to production" templates unless they make sense for this specific goal
- Tailor action items to the domain and context of the research
- Include specific, actionable steps with realistic timelines and resources

For example:
- If researching "best family car" → recommend specific car models, comparison steps, test drives
- If researching "law school alternatives" → recommend specific programs, application steps, bar exam prep
- If researching "quantum computing" → recommend learning paths, tools, research papers
- If researching business strategies → recommend market analysis, competitor research, implementation plans`;

    const userPrompt = `
RESEARCH GOAL: ${goal}

RESEARCH FINDINGS (${totalSteps} steps, ${totalDataPoints} data points):
${researchSummary}

Generate 3-4 CONTEXTUAL action items that directly help achieve or implement the research goal based on these findings.

REQUIREMENTS:
1. Each action item must be SPECIFIC to "${goal}" - not generic project management steps
2. Reference actual research findings in the description
3. Provide realistic timelines appropriate for the goal (not always "Week 1-4")
4. Include relevant resources and metrics for this specific domain
5. Identify domain-specific risks and mitigation strategies

Also generate a comprehensive 2-3 paragraph executive summary that:
- Directly addresses what was learned about "${goal}"
- Highlights the most important findings with specifics
- Provides clear conclusions and recommendations based on the research

Format:
{
  "actionItems": [
    {
      "id": "1",
      "title": "Specific action relevant to ${goal}",
      "description": "Detailed description referencing actual research findings...",
      "timeline": "Appropriate timeline (e.g., '1-2 weeks', '3 months', 'Immediately')",
      "timelineDetails": "Breakdown of timeline phases",
      "priority": "High" | "Medium" | "Low",
      "resources": {
        "budget": "Realistic budget if applicable, or 'Minimal cost' or 'Research only'",
        "team": "Required people/roles",
        "tools": ["Domain-specific tools/resources"]
      },
      "metrics": ["Specific success metrics for this action"],
      "risks": [
        {
          "risk": "Domain-specific risk",
          "mitigation": "Realistic mitigation strategy"
        }
      ],
      "references": [
        { "title": "Relevant resource", "url": "URL if applicable" }
      ],
      "researchContext": "How this connects to research findings"
    }
  ],
  "summary": "Comprehensive 2-3 paragraph executive summary addressing the research goal with specific findings and recommendations..."
}`;

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
              name: "generate_action_plan",
              description: "Generate contextual action items and executive summary based on research findings",
              parameters: {
                type: "object",
                properties: {
                  actionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        timeline: { type: "string" },
                        timelineDetails: { type: "string" },
                        priority: { type: "string", enum: ["High", "Medium", "Low"] },
                        resources: {
                          type: "object",
                          properties: {
                            budget: { type: "string" },
                            team: { type: "string" },
                            tools: { type: "array", items: { type: "string" } }
                          }
                        },
                        metrics: { type: "array", items: { type: "string" } },
                        risks: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              risk: { type: "string" },
                              mitigation: { type: "string" }
                            }
                          }
                        },
                        references: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              url: { type: "string" }
                            }
                          }
                        },
                        researchContext: { type: "string" }
                      },
                      required: ["id", "title", "description", "timeline", "priority", "resources", "metrics"]
                    }
                  },
                  summary: {
                    type: "string",
                    description: "Comprehensive executive summary (2-3 paragraphs)"
                  }
                },
                required: ["actionItems", "summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_action_plan" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached" }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    console.log('Generated action items:', result.actionItems?.length || 0);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-action-items function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
