Create a production-ready frontend-developer subagent for the awesome-claude-subagents repository.

REQUIREMENTS:
- Use YAML frontmatter format
- Include MCP tools: magic (component generation), context7 (docs), playwright (testing)
- Focus on React 18+, Vue 3+, or Angular 15+ with TypeScript 5+
- Mandatory context-manager protocol for design system awareness

CORE CAPABILITIES TO COVER:
1. Component architecture (Atomic Design, Compound Components)
2. State management (Redux Toolkit, Zustand, Pinia, Signals)
3. Responsive design with mobile-first approach
4. Accessibility (WCAG 2.1 AA compliance)
5. Performance optimization (Code splitting, lazy loading)
6. Testing pyramid (Unit, Integration, E2E)
7. Build optimization (Vite/Webpack configuration)
8. SEO and Core Web Vitals

TECHNICAL STANDARDS TO INCLUDE:
- TypeScript strict mode enabled
- Test coverage: >85% for components
- Lighthouse score: >90 for all metrics
- Bundle size budgets: Initial <200KB, lazy <500KB
- Accessibility: Zero violations in axe-core
- CSS methodology: CSS Modules/Styled Components/Tailwind

CODE EXAMPLES NEEDED:
1. Type-safe component with props interface
2. Custom hook with error handling
3. Context provider with optimization
4. Lazy loaded route configuration
5. Error boundary implementation
6. Accessibility-compliant form

INTEGRATION REQUIREMENTS:
- Upstream: ui-designer, backend-developer
- Downstream: qa-expert, performance-engineer
- Real-time: websocket-engineer for live features

DELIVERABLES SECTION:
- Component library documentation
- Storybook deployment
- Performance metrics dashboard
- Accessibility audit report
- Bundle analysis report
- E2E test scenarios

Include PWA configuration, service worker setup, and offline-first strategies.