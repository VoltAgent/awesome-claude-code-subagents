# RuFlo Research

> Goal-Oriented Action Planning UI for autonomous AI research workflows. Part of the [RuFlo](https://github.com/ruvnet/ruflo) platform.
> Live: [goal.ruv.io](https://goal.ruv.io/) · Agents dashboard: [goal.ruv.io/agents](https://goal.ruv.io/agents)

Turn plain-English research goals into executable agent plans. RuFlo Research applies classic Goal-Oriented Action Planning (GOAP) — A* search through a state space of actions with preconditions and effects — to autonomous AI research, then dispatches the work to live agents you can inspect in real time.

## Highlights

| | |
|---|---|
| 🎯 **Plain-English goals** | Describe an outcome — RuFlo extracts success criteria, constraints, and implicit preconditions |
| 🧭 **GOAP A\* planner** | Shortest-path search through actions with preconditions/effects; replans on the fly when state changes |
| 🤖 **Live agent dashboard** | `/agents` shows every spawned agent — role, current step, status, trajectories |
| 🌳 **Visual plan tree** | Goals render as collapsible action trees with progress, blocked branches, rollbacks |
| ♻️ **Adaptive replanning** | When an action fails, A* re-runs from the current state instead of restarting |
| 🔌 **Embeddable widget** | Drop the research UI into any site via `<script src="widget.js">` |

## Quick Start

```bash
# from /v3/goal_ui
npm install
npm run dev          # main app on http://localhost:8080
```

For the embeddable widget:

```bash
npm run build:widget         # produces dist/widget.js + dist/widget.css
npm run widget:dev           # build widget + start dev server
```

## Project Structure

```
v3/goal_ui/
├── src/
│   ├── components/          # React components (GoalInput, AgentStep, ResearchReportModal, …)
│   ├── pages/               # Index, Agents, Demo, NotFound
│   ├── lib/goapPlanner.ts   # GOAP A* implementation
│   ├── integrations/supabase/  # Supabase client + types
│   └── widget.tsx           # Embeddable widget entry
├── supabase/functions/      # Edge functions (research-step, generate-research-goal, …)
├── public/                  # Static assets, widget-embed.html demo
├── docs/                    # DEPLOYMENT.md, WIDGET-INTEGRATION.md, WIDGET_SETUP.md
└── netlify.toml             # Hosting config
```

## Embedding the Widget

```html
<div id="ruflo-research-widget-container"></div>
<script>
  window.RufloResearchWidgetConfig = {
    primaryColor: "#8b5cf6",
    accentColor: "#10b981",
  };
</script>
<script src="https://goal.ruv.io/widget.js"></script>
<link rel="stylesheet" href="https://goal.ruv.io/widget.css" />
```

The widget exposes a global `window.RufloResearchWidget` with `init(containerId)` and `version` for programmatic control. See [`docs/WIDGET-INTEGRATION.md`](docs/WIDGET-INTEGRATION.md) for the full integration guide.

## Tech Stack

React 18 · TypeScript 5 · Vite 5 · Tailwind 3 · shadcn/ui · Radix UI · React Query · React Router · Supabase Edge Functions · GOAP A* planner

## Deployment

Hosted on Netlify (`netlify.toml`) at [goal.ruv.io](https://goal.ruv.io/). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for self-hosting instructions and edge-function deploy steps.

## Environment

Copy `example.env` → `.env` and set the Supabase publishable variables (all `VITE_*` prefixed and safe to ship to the browser):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## License

MIT — same as the parent [RuFlo](https://github.com/ruvnet/ruflo) project.
