import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchRequest {
  goal: string;
  config?: {
    parameters?: {
      maxSources?: number;
      minConfidence?: number;
      maxSteps?: number;
      timeout?: number;
      parallelAgents?: number;
    };
    filters?: {
      sourceTypes?: string[];
      excludeDomains?: string[];
      dateRange?: string;
    };
    researchGuidance?: {
      timeframe?: string;
      depth?: string;
      perspective?: string;
      focusAreas?: string[];
    };
    goapConfig?: {
      enableReplanning?: boolean;
      executionMode?: string;
      costOptimization?: boolean;
      parallelExecution?: boolean;
    };
    prompts?: {
      systemPrompt?: string;
    };
  };
  aiModel?: string;
  stream?: boolean;
}

interface ResearchStep {
  stepNumber: number;
  stepTitle: string;
  stepDescription: string;
  stepType: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { goal, config = {}, aiModel = 'google/gemini-2.5-flash', stream: enableStreaming = true }: ResearchRequest = await req.json();

    if (!goal) {
      return new Response(
        JSON.stringify({ error: 'Goal is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Research API request:', { goal, aiModel, stream: enableStreaming, config });

    // Generate research steps based on the goal
    const steps: ResearchStep[] = [
      { stepNumber: 1, stepTitle: 'Initial Research', stepDescription: 'Gathering preliminary information', stepType: '1' },
      { stepNumber: 2, stepTitle: 'Deep Analysis', stepDescription: 'Analyzing collected data in depth', stepType: '2' },
      { stepNumber: 3, stepTitle: 'Source Validation', stepDescription: 'Verifying sources and cross-referencing', stepType: '3' },
      { stepNumber: 4, stepTitle: 'Pattern Recognition', stepDescription: 'Identifying key patterns and trends', stepType: '4' },
      { stepNumber: 5, stepTitle: 'Synthesis', stepDescription: 'Synthesizing findings into coherent insights', stepType: '5' },
      { stepNumber: 6, stepTitle: 'Insight Generation', stepDescription: 'Generating actionable insights', stepType: '6' },
      { stepNumber: 7, stepTitle: 'Verification', stepDescription: 'Cross-checking findings and ensuring accuracy', stepType: '7' },
      { stepNumber: 8, stepTitle: 'Final Recommendations', stepDescription: 'Providing final recommendations based on research', stepType: 'final-report' },
    ];

    const maxSteps = config.parameters?.maxSteps || 8;
    const researchSteps = steps.slice(0, Math.min(maxSteps, steps.length));

    if (!enableStreaming) {
      // Non-streaming response
      const allFindings = [];
      
      for (const step of researchSteps) {
        const stepResult = await executeResearchStep(step, goal, config, aiModel, LOVABLE_API_KEY);
        allFindings.push(stepResult);
      }

      return new Response(
        JSON.stringify({
          goal,
          config,
          totalSteps: researchSteps.length,
          findings: allFindings,
          completed: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Streaming response using SSE
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'init',
            goal,
            totalSteps: researchSteps.length,
            config
          })}\n\n`));

          // Execute research steps
          for (let i = 0; i < researchSteps.length; i++) {
            const step = researchSteps[i];
            
            // Send step start event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'step_start',
              stepNumber: step.stepNumber,
              stepTitle: step.stepTitle,
              stepDescription: step.stepDescription,
              progress: ((i / researchSteps.length) * 100).toFixed(1)
            })}\n\n`));

            // Execute step
            const stepResult = await executeResearchStep(step, goal, config, aiModel, LOVABLE_API_KEY);

            // Send step complete event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'step_complete',
              stepNumber: step.stepNumber,
              data: stepResult,
              progress: (((i + 1) / researchSteps.length) * 100).toFixed(1)
            })}\n\n`));
          }

          // Send completion event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            message: 'Research completed successfully'
          })}\n\n`));

          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: errorMessage
          })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Research API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function executeResearchStep(
  step: ResearchStep,
  goal: string,
  config: any,
  aiModel: string,
  apiKey: string
) {
  const systemPrompt = config.prompts?.systemPrompt || buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(step, goal, config);

  console.log(`Executing step ${step.stepNumber}: ${step.stepTitle}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      tools: step.stepType === 'final-report' ? [
        {
          type: 'function',
          function: {
            name: 'generate_research_report',
            description: 'Generate structured research findings with citations',
            parameters: {
              type: 'object',
              properties: {
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      content: { type: 'string' },
                      source: { type: 'string' },
                      confidence: { type: 'number' }
                    },
                    required: ['title', 'content', 'source', 'confidence']
                  }
                }
              },
              required: ['findings']
            }
          }
        }
      ] : undefined,
      tool_choice: step.stepType === 'final-report' ? { type: 'function', function: { name: 'generate_research_report' } } : undefined
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API error (${response.status}):`, errorText);
    throw new Error(`AI API request failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`Step ${step.stepNumber} completed`);

  // Extract findings from tool call if present
  if (data.choices?.[0]?.message?.tool_calls?.[0]) {
    const toolCall = data.choices[0].message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);
    return {
      stepNumber: step.stepNumber,
      stepTitle: step.stepTitle,
      findings: args.findings,
      timestamp: new Date().toISOString()
    };
  }

  // Return plain text response
  return {
    stepNumber: step.stepNumber,
    stepTitle: step.stepTitle,
    content: data.choices?.[0]?.message?.content || '',
    timestamp: new Date().toISOString()
  };
}

function buildSystemPrompt(config: any): string {
  const depth = config.researchGuidance?.depth || 'moderate';
  const perspective = config.researchGuidance?.perspective || 'balanced';
  const timeframe = config.researchGuidance?.timeframe || 'recent';

  let prompt = `You are an advanced AI research assistant specializing in comprehensive, systematic research.`;

  if (depth === 'deep') {
    prompt += ` Conduct deep, rigorous investigations with extensive analysis and cross-referencing.`;
  } else if (depth === 'surface') {
    prompt += ` Provide high-level overviews and key highlights.`;
  } else {
    prompt += ` Balance depth and breadth in your analysis.`;
  }

  if (perspective === 'academic') {
    prompt += ` Adopt an academic perspective, prioritizing peer-reviewed sources and scholarly rigor.`;
  } else if (perspective === 'business') {
    prompt += ` Focus on practical business implications and actionable insights.`;
  } else if (perspective === 'technical') {
    prompt += ` Emphasize technical details, methodologies, and implementation considerations.`;
  }

  if (timeframe === 'recent') {
    prompt += ` Prioritize the most recent information and developments.`;
  } else if (timeframe === 'historical') {
    prompt += ` Include historical context and long-term trends.`;
  }

  const focusAreas = config.researchGuidance?.focusAreas;
  if (focusAreas && focusAreas.length > 0) {
    prompt += ` Pay special attention to: ${focusAreas.join(', ')}.`;
  }

  prompt += ` Always cite sources and provide confidence levels for your findings.`;

  return prompt;
}

function buildUserPrompt(step: ResearchStep, goal: string, config: any): string {
  let prompt = `Research Goal: ${goal}\n\n`;
  prompt += `Current Step: ${step.stepTitle}\n`;
  prompt += `Step Description: ${step.stepDescription}\n\n`;

  if (step.stepType === 'final-report') {
    prompt += `Provide final recommendations and actionable insights based on all research conducted. `;
    prompt += `Include specific, concrete suggestions with supporting data.`;
  } else {
    prompt += `Conduct research for this step and provide detailed findings.`;
  }

  const sourceTypes = config.filters?.sourceTypes;
  if (sourceTypes && sourceTypes.length > 0) {
    prompt += `\n\nPreferred source types: ${sourceTypes.join(', ')}`;
  }

  const excludeDomains = config.filters?.excludeDomains;
  if (excludeDomains && excludeDomains.length > 0) {
    prompt += `\n\nExclude sources from: ${excludeDomains.join(', ')}`;
  }

  const minConfidence = config.parameters?.minConfidence;
  if (minConfidence) {
    prompt += `\n\nMinimum confidence threshold: ${minConfidence}%`;
  }

  return prompt;
}
