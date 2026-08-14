---
name: add-model-descriptions
description: Add descriptions for new models from the HuggingFace router to chat-ui configuration. Use when new models are released on the router and need descriptions added to prod.yaml and dev.yaml. Triggers on requests like "add new model descriptions", "update models from router", "sync models", or when explicitly invoking /add-model-descriptions.
---

# Add Model Descriptions

Add descriptions for new models available in the HuggingFace router to chat-ui's prod.yaml and dev.yaml.

## Workflow

1. **Fetch models from router**

   ```
   WebFetch https://router.huggingface.co/v1/models
   ```

   Extract all model IDs from the response.

2. **Read current configuration**

   - Read `chart/env/prod.yaml`
   - Extract model IDs from the `MODELS` JSON array in `envVars`

3. **Identify missing models**
   Compare router models with prod.yaml. Missing = in router but not in prod.yaml.

4. **Research each missing model**
   For each missing model, search the web for its specifications:

   - Model architecture (dense, MoE, parameters)
   - Key capabilities (coding, reasoning, vision, multilingual, etc.)
   - Target use cases

5. **Write descriptions**
   Match existing style:

   - 8-12 words
   - Sentence fragments (no period needed)
   - No articles ("a", "the") unless necessary
   - Focus on: architecture, specialization, key capability

   Examples:

   - `"Flagship GLM MoE for coding, reasoning, and agentic tool use."`
   - `"MoE agent model with multilingual coding and fast outputs."`
   - `"Vision-language Qwen for documents, GUI agents, and visual reasoning."`
   - `"Mobile agent for multilingual Android device automation."`

6. **Update both files**
   Add new models at the TOP of the MODELS array in:

   - `chart/env/prod.yaml`
   - `chart/env/dev.yaml`

   Format:

   ```json
   { "id": "org/model-name", "description": "Description here." }
   ```

7. **Commit changes**
   ```
   git add chart/env/prod.yaml chart/env/dev.yaml
   git commit -m "feat: add descriptions for N new models from router"
   ```

## Notes

- FP8 variants: describe as "FP8 [base model] for efficient inference with [key capability]"
- Vision models: mention "vision-language" and key visual tasks
- Agent models: mention "agent" and automation capabilities
- Regional models: mention language focus (e.g., "European multilingual", "Southeast Asian")
