# Barrels & Badges 2026 - Subagent Selection Strategy

## Executive Summary

**Recommended Approach**: Next.js-based standalone website with integrated payment processing, SEO optimization, and content management. **Total Team Size: 11 subagents** across 3 phases.

**Timeline**: 6-8 weeks to MVP launch
**Key Decision**: Next.js over WordPress for maintainability, performance, and modern tooling

---

## Critical Questions - Answered

### 1. Should we use nextjs-developer or fullstack-developer as the lead?
**Answer: nextjs-developer** (with backend-developer support)

**Why nextjs-developer wins:**
- **Built-in SEO optimization** (Meta API, sitemap generation, structured data) - critical for "Columbus bourbon events" ranking
- **Performance by default**: Core Web Vitals > 90, Lighthouse > 95
- **Server components**: Faster page loads for premium feel
- **TypeScript strict mode**: Reduces bugs, easier for future maintainers
- **Vercel deployment**: One-click deploys, maintainable by non-technical staff
- **App Router architecture**: Modern, scalable foundation

**When to use fullstack-developer instead:**
- Complex multi-service architecture (you don't need this)
- Non-JavaScript backend required (you don't need this)
- Legacy system integration (you don't have this)

### 2. Do we need wordpress-master at all, or go pure custom?
**Answer: Go pure custom (Next.js)**

**Why skip WordPress:**
- ✅ You explicitly said "NOT WordPress"
- ✅ Next.js provides better performance (critical for premium brand)
- ✅ Stripe integration is cleaner in custom code
- ✅ Better developer experience for future updates
- ✅ Lower hosting costs with static generation
- ✅ Superior SEO capabilities with Next.js 14+
- ✅ Content can be managed through custom admin dashboard (Week 6-8)

**When WordPress would make sense:**
- Multiple non-technical content editors needed day 1
- Large existing WordPress content to migrate
- Client specifically requests WordPress

### 3. How critical is payment-integration specialist vs general backend dev?
**Answer: CRITICAL - Engage payment-integration specialist**

**Why payment-integration is essential:**
- **PCI DSS compliance**: Not optional for payment processing
- **Transaction success > 99.9%**: payment-integration specialist guarantees this
- **Fraud prevention**: Critical for premium ticket prices ($150-200)
- **Stripe expertise**: Webhook handling, idempotency, subscription billing
- **Early bird pricing**: Requires proper promo code infrastructure
- **Two-tier tickets**: Needs robust pricing logic

**Backend-developer alone would:**
- ❌ Miss PCI compliance requirements
- ❌ Implement basic Stripe without fraud prevention
- ❌ Lack expertise in payment retry logic
- ❌ Not optimize transaction success rates

**Cost-benefit**: Payment specialist prevents even one payment failure that loses a $200 VIP ticket

### 4. Should agent-organizer or multi-agent-coordinator run the project?
**Answer: agent-organizer**

**Why agent-organizer:**
- **Team size**: 11 subagents (multi-agent-coordinator optimized for 87+ agents)
- **Project focus**: Single website build (not distributed system coordination)
- **Task decomposition**: Excellent at breaking down features into subtasks
- **Resource optimization**: Tracks agent performance and workload
- **Timeline management**: Built for project delivery, not infrastructure orchestration

**When to use multi-agent-coordinator:**
- 100+ agents working in parallel
- Complex distributed workflows with message queues
- Real-time inter-agent communication needs
- Microservices architecture with circuit breakers

### 5. Is seo-specialist essential for MVP or Phase 2?
**Answer: ESSENTIAL for MVP (Phase 1-2)**

**Why SEO from day 1:**
- **Event timeline**: 2026 event means you need to rank NOW for "Columbus bourbon events 2026"
- **Organic traffic**: Cheaper than paid ads for premium audience
- **Technical SEO**: Easier to build correctly than fix later
- **Schema markup**: Event schema boosts visibility in Google Events
- **Core Web Vitals**: Premium brand needs fast site (affects ranking)
- **Competitive advantage**: Bourbon events have low online competition

**SEO in Phase 1-2 delivers:**
- Event schema for Google Events carousel
- Local SEO for "Columbus bourbon tasting"
- Site architecture optimized for ranking
- Open Graph tags for social sharing
- Technical foundation that scales

**Delaying SEO to post-MVP means:**
- ❌ Rebuilding site architecture
- ❌ Lost months of ranking time
- ❌ Higher paid advertising spend
- ❌ Lower organic ticket sales

---

## Phased Subagent Strategy

### **PHASE 1: Foundation (Weeks 1-2)**
**Goal**: Establish project structure, core architecture, and visual identity

#### Primary Subagents (5)

**1. agent-organizer** (Orchestration) - `categories/09-meta-orchestration/agent-organizer.md`
- **Why**: Coordinates all 11 subagents, manages dependencies, tracks progress
- **Deliverables**:
  - Project charter with scope, timeline, milestones
  - Subagent task allocation (WBS - Work Breakdown Structure)
  - Communication plan and handoff protocols
  - Risk register (payment failures, timeline slips, scope creep)
- **Dependencies**: None (first to engage)
- **Success Metrics**:
  - On-time delivery > 90%
  - Budget variance < 5%
  - All dependencies tracked in Jira/Asana
  - Daily standup reports

**2. project-manager** (Delivery Coordination) - `categories/08-business-product/project-manager.md`
- **Why**: Manages timeline, resources, stakeholder communication
- **Deliverables**:
  - 6-8 week project plan with milestones
  - Resource allocation plan
  - Risk mitigation strategies
  - Weekly status reports for Simon Kenton Council
- **Dependencies**: Works with agent-organizer on planning
- **Success Metrics**:
  - Milestone completion rate > 95%
  - Stakeholder satisfaction > 90%
  - Zero critical path delays
  - Risk mitigation effectiveness

**3. nextjs-developer** (Technical Lead) - `categories/02-language-specialists/nextjs-developer.md`
- **Why**: Sets up Next.js 14+ foundation, establishes patterns
- **Deliverables**:
  - Next.js 14 project with App Router
  - TypeScript configuration (strict mode)
  - Project structure (app/, components/, lib/, public/)
  - Tailwind CSS setup with design system tokens
  - ESLint + Prettier configuration
  - Git repository structure
- **Dependencies**: None (parallel with ui-designer)
- **Success Metrics**:
  - Lighthouse score > 90 on initial setup
  - TypeScript 100% coverage
  - Build time < 60s
  - Development environment < 5min setup

**4. ui-designer** (Visual Identity) - `categories/01-core-development/ui-designer.md`
- **Why**: Creates premium brand aesthetic matching upscale venue
- **Deliverables**:
  - Design system (typography, colors, spacing)
  - High-fidelity mockups (landing, ticket, sponsorship pages)
  - Component library in Figma
  - Responsive breakpoint strategy
  - WCAG 2.1 AA accessible color palettes
  - Dark mode design (optional, for premium feel)
- **Dependencies**: None (parallel with nextjs-developer)
- **Success Metrics**:
  - Stakeholder approval on designs
  - WCAG 2.1 AA contrast ratios
  - 5-10 reusable components designed
  - Mobile, tablet, desktop layouts complete

**5. seo-specialist** (SEO Foundation) - `categories/07-specialized-domains/seo-specialist.md`
- **Why**: Establishes technical SEO foundation early
- **Deliverables**:
  - Keyword research ("Columbus bourbon events", "premium bourbon tasting")
  - Site architecture plan (URL structure, navigation hierarchy)
  - Event schema markup specification
  - Open Graph + Twitter Card templates
  - Sitemap.xml configuration
  - Robots.txt configuration
  - Core Web Vitals baseline targets
- **Dependencies**: Works with nextjs-developer on architecture
- **Success Metrics**:
  - 20+ target keywords identified
  - Site architecture optimized for SEO
  - Schema markup specification complete
  - Core Web Vitals targets defined (LCP < 2.5s, CLS < 0.1)

---

### **PHASE 2: Core Features (Weeks 3-5)**
**Goal**: Build critical user-facing features - tickets, sponsorships, auction preview

#### Primary Subagents (6)

**6. payment-integration** (Payment Systems) - `categories/07-specialized-domains/payment-integration.md`
- **Why**: Implements secure, PCI-compliant ticket sales
- **Deliverables**:
  - Stripe integration (payment processing)
  - Two-tier ticket system (VIP $200, Standard $150)
  - Early bird pricing logic with expiration
  - Promo code system
  - Payment confirmation emails
  - Webhook handling (payment.succeeded, payment.failed)
  - Refund/cancellation flow
  - Admin transaction dashboard
- **Dependencies**: nextjs-developer (API routes), backend-developer (database)
- **Success Metrics**:
  - Transaction success rate > 99.9%
  - PCI DSS compliance verified
  - Processing time < 3s
  - Zero payment data stored locally
  - Fraud detection active

**7. backend-developer** (API & Database) - `categories/01-core-development/backend-developer.md`
- **Why**: Builds scalable APIs for tickets, sponsorships, email capture
- **Deliverables**:
  - PostgreSQL database schema (tickets, sponsors, emails, auction_items)
  - REST API endpoints (/api/tickets, /api/sponsors, /api/emails)
  - Authentication middleware (admin dashboard)
  - Rate limiting (prevent spam on forms)
  - Database migrations with Prisma
  - Connection pooling configuration
  - API documentation (OpenAPI spec)
- **Dependencies**: nextjs-developer (API route structure)
- **Success Metrics**:
  - API response time < 100ms p95
  - 85%+ test coverage
  - Zero SQL injection vulnerabilities
  - Database properly indexed

**8. react-specialist** (Frontend Components) - `categories/02-language-specialists/react-specialist.md`
- **Why**: Builds interactive, performant UI components
- **Deliverables**:
  - Ticket purchase flow (tier selection, checkout, confirmation)
  - Sponsorship application form
  - Email capture component (Constant Contact integration)
  - Countdown timer (to event date)
  - Auction item gallery
  - Mobile-responsive navigation
  - Loading states and error boundaries
  - Form validation (React Hook Form)
- **Dependencies**: ui-designer (designs), backend-developer (APIs)
- **Success Metrics**:
  - Component reusability > 80%
  - Bundle size < 150KB gzipped
  - Test coverage > 90%
  - Zero accessibility violations

**9. content-marketer** (Content Strategy) - `categories/08-business-product/content-marketer.md`
- **Why**: Creates compelling copy that drives ticket sales
- **Deliverables**:
  - Landing page copy (hero, event story, testimonials)
  - Ticket tier descriptions (VIP benefits, Standard features)
  - Sponsorship package copy (benefits showcase)
  - Email marketing copy (Constant Contact campaigns)
  - Social sharing templates
  - Meta descriptions for all pages
  - Call-to-action optimization
- **Dependencies**: seo-specialist (keyword integration)
- **Success Metrics**:
  - Landing page conversion rate > 3%
  - Email signup rate > 8%
  - SEO score > 80 on all pages
  - Brand voice consistency across all content

**10. seo-specialist** (CONTINUED - On-Page Optimization) - `categories/07-specialized-domains/seo-specialist.md`
- **Why**: Implements SEO technical requirements
- **Deliverables**:
  - Page-level optimization (titles, meta descriptions, H1-H6)
  - Event schema implementation (JSON-LD)
  - Local business schema (The Bluestone, Columbus OH)
  - Image optimization (alt tags, lazy loading, WebP format)
  - Internal linking structure
  - Google Search Console setup
  - Google Analytics 4 integration
- **Dependencies**: react-specialist (components), content-marketer (copy)
- **Success Metrics**:
  - Lighthouse SEO score > 95
  - All pages indexed within 48 hours
  - Structured data validation passes
  - Core Web Vitals in "Good" range

**11. qa-expert** (Quality Assurance) - `categories/04-quality-security/qa-expert.md`
- **Why**: Ensures bug-free launch, especially critical for payment flows
- **Deliverables**:
  - Test plan (functional, payment, cross-browser, mobile)
  - Automated test suite (Playwright E2E tests)
  - Payment flow testing (Stripe test mode)
  - Cross-browser testing (Chrome, Safari, Firefox, Edge)
  - Mobile responsiveness testing (iOS, Android)
  - Accessibility audit (WCAG 2.1 AA)
  - Load testing (simulate 500 concurrent users)
  - Defect tracking and resolution
- **Dependencies**: All development subagents
- **Success Metrics**:
  - Test coverage > 85%
  - Zero critical bugs in production
  - Payment flow success rate > 99%
  - Mobile usability score 100/100

---

### **PHASE 3: Polish & Launch (Weeks 6-8)**
**Goal**: Optimize performance, secure the site, deploy to production, enable maintainability

#### Primary Subagents (4)

**12. devops-engineer** (Deployment & Infrastructure) - `categories/03-infrastructure/devops-engineer.md`
- **Why**: Deploys to production with CI/CD, monitoring, and rollback capabilities
- **Deliverables**:
  - Vercel deployment configuration (recommended for Next.js)
  - Environment variables setup (production, staging, development)
  - CI/CD pipeline (GitHub Actions)
    - Automated testing on PR
    - Build verification
    - Deployment on merge to main
  - SSL certificate setup
  - Custom domain configuration (e.g., barrelsandbadges.org)
  - CDN configuration (Vercel Edge Network)
  - Database backups (daily automated to AWS S3)
  - Monitoring setup (Vercel Analytics + Sentry error tracking)
- **Dependencies**: nextjs-developer (build configuration), qa-expert (test suite)
- **Success Metrics**:
  - Deployment time < 5 minutes
  - Zero-downtime deployments
  - Automated backups verified
  - Uptime > 99.9%
  - Rollback procedure tested

**13. backend-developer** (CONTINUED - Admin Dashboard) - `categories/01-core-development/backend-developer.md`
- **Why**: Enables non-technical staff to manage content post-launch
- **Deliverables**:
  - Admin authentication (NextAuth.js with role-based access)
  - Dashboard pages:
    - Ticket sales tracker (daily revenue, tier breakdown)
    - Attendee list export (CSV download)
    - Sponsorship applications management
    - Email list management
    - Auction item CRUD (Create, Read, Update, Delete)
    - Event details editor (date, venue, description)
  - Constant Contact API integration (sync email signups)
  - Analytics dashboard (GA4 metrics visualized)
- **Dependencies**: react-specialist (admin UI components)
- **Success Metrics**:
  - Admin tasks < 3 clicks
  - CSV export < 2 seconds
  - Non-technical user can update event details
  - Email sync runs every 15 minutes

**14. security-engineer** (Security Hardening) - `categories/03-infrastructure/security-engineer.md`
- **Why**: Protects payment data, prevents attacks, ensures compliance
- **Deliverables**:
  - Security audit report
  - OWASP Top 10 vulnerability scan
  - Rate limiting on all forms (prevent spam/DDoS)
  - CSRF protection (Next.js built-in + custom tokens)
  - SQL injection prevention verification
  - XSS protection (Content Security Policy headers)
  - Secure cookie configuration (httpOnly, secure, sameSite)
  - Environment variable encryption
  - Dependency vulnerability scan (npm audit, Snyk)
  - PCI DSS compliance checklist (with payment-integration)
- **Dependencies**: backend-developer (APIs), payment-integration (Stripe)
- **Success Metrics**:
  - Zero high/critical vulnerabilities
  - OWASP Top 10 compliance 100%
  - Penetration test passed
  - PCI DSS self-assessment complete

**15. performance-engineer** (Performance Optimization) - `categories/04-quality-security/performance-engineer.md`
- **Why**: Ensures premium brand feel with instant page loads
- **Deliverables**:
  - Core Web Vitals optimization:
    - LCP (Largest Contentful Paint) < 2.5s
    - FID (First Input Delay) < 100ms
    - CLS (Cumulative Layout Shift) < 0.1
  - Image optimization (next/image, WebP format, lazy loading)
  - Font optimization (subset fonts, preload critical fonts)
  - JavaScript bundle analysis (identify large dependencies)
  - Code splitting (dynamic imports for auction gallery)
  - Database query optimization (add indexes, reduce N+1 queries)
  - CDN cache configuration (static assets cached 1 year)
  - Lighthouse CI integration (fail build if score < 90)
- **Dependencies**: nextjs-developer, react-specialist, backend-developer
- **Success Metrics**:
  - Lighthouse Performance > 95
  - Lighthouse SEO > 95
  - Lighthouse Accessibility > 95
  - Time to Interactive < 3s
  - Bundle size < 200KB gzipped

---

## Subagent Orchestration Strategy

### Coordination Model

**Primary Coordinator: agent-organizer**
- Daily standup coordination (async via Slack/project management tool)
- Dependency management (tracks blockers, handoffs)
- Progress reporting to project-manager
- Workload balancing across subagents

**Secondary Coordinator: project-manager**
- Weekly stakeholder updates to Simon Kenton Council
- Timeline management (milestone tracking)
- Risk escalation and mitigation
- Budget tracking (if applicable)

### Handoff Protocols

#### Phase 1 → Phase 2 Handoff
**Trigger**: ui-designer and nextjs-developer complete foundation

**Handoff Package**:
- ✅ Design system (Figma files + design tokens exported)
- ✅ Next.js project structure (GitHub repository)
- ✅ TypeScript types defined (User, Ticket, Sponsor, AuctionItem)
- ✅ SEO architecture document (URL structure, schema templates)

**Recipients**:
- payment-integration receives design system + Next.js API route structure
- backend-developer receives TypeScript types + database schema plan
- react-specialist receives design system + component specifications
- content-marketer receives SEO keyword targets

#### Phase 2 → Phase 3 Handoff
**Trigger**: Core features complete (tickets, sponsorships, auction, email capture)

**Handoff Package**:
- ✅ Tested codebase (85%+ coverage)
- ✅ API documentation (OpenAPI spec)
- ✅ Database schema finalized (migration scripts)
- ✅ Environment variable list (for devops-engineer)
- ✅ Known issues log (for security-engineer and performance-engineer)

**Recipients**:
- devops-engineer receives deployment requirements + environment config
- security-engineer receives codebase for security audit
- performance-engineer receives production build for optimization
- backend-developer (admin dashboard) receives database schema + API patterns

### Dependency Map

```
PHASE 1 (Parallel Execution - Week 1-2)
├─ agent-organizer (Independent)
├─ project-manager (Independent)
├─ nextjs-developer (Independent)
├─ ui-designer (Independent)
└─ seo-specialist (Lightweight dependency on nextjs-developer for architecture)

PHASE 2 (Sequential + Parallel - Week 3-5)
├─ payment-integration → DEPENDS ON → nextjs-developer (API routes), backend-developer (database)
├─ backend-developer → DEPENDS ON → nextjs-developer (project structure)
├─ react-specialist → DEPENDS ON → ui-designer (designs), backend-developer (APIs)
├─ content-marketer → DEPENDS ON → seo-specialist (keywords), ui-designer (page layouts)
├─ seo-specialist (continued) → DEPENDS ON → react-specialist (components), content-marketer (copy)
└─ qa-expert → DEPENDS ON → ALL development subagents (testing happens as features complete)

PHASE 3 (Sequential - Week 6-8)
├─ devops-engineer → DEPENDS ON → qa-expert (test suite passes)
├─ backend-developer (admin) → DEPENDS ON → payment-integration (data models), react-specialist (UI patterns)
├─ security-engineer → DEPENDS ON → devops-engineer (infrastructure), ALL development (codebase)
└─ performance-engineer → DEPENDS ON → devops-engineer (production build), ALL development
```

### Communication Cadence

**Daily**:
- agent-organizer: Async standup (blockers, progress, needs)
- Development subagents: Code reviews, pair programming

**Weekly**:
- project-manager: Stakeholder status report
- agent-organizer: Sprint retrospective (what went well, what to improve)
- Team demo: Show progress to Simon Kenton Council

**Phase Gates**:
- End of Phase 1: Design approval, architecture approval
- End of Phase 2: Feature complete demo, payment flow validation
- End of Phase 3: Go/no-go decision, production launch

---

## Success Metrics by Phase

### Phase 1 Success Criteria (Week 1-2)
- ✅ Next.js project builds successfully
- ✅ Design system approved by stakeholders
- ✅ Project plan with milestones documented
- ✅ SEO architecture defined (20+ keywords, site structure)
- ✅ Team communication protocols established

### Phase 2 Success Criteria (Week 3-5)
- ✅ Ticket purchase flow functional (end-to-end test passes)
- ✅ Payment integration verified (Stripe test mode transactions succeed)
- ✅ Sponsorship application form submits to database
- ✅ Email capture integrates with Constant Contact
- ✅ Auction preview gallery renders 10+ items
- ✅ Mobile responsive on iOS + Android (tested on BrowserStack)
- ✅ Test coverage > 85%
- ✅ Lighthouse Performance > 90

### Phase 3 Success Criteria (Week 6-8)
- ✅ Deployed to production at custom domain
- ✅ SSL certificate valid
- ✅ Zero high/critical security vulnerabilities
- ✅ Core Web Vitals in "Good" range (Search Console)
- ✅ Admin dashboard functional (non-technical staff trained)
- ✅ Monitoring active (Sentry error tracking, Vercel Analytics)
- ✅ Automated backups verified (restore test passed)
- ✅ Rollback procedure documented and tested
- ✅ Post-event survey form ready (enabled after event)

---

## Alternatives Considered & Rejected

### Why NOT fullstack-developer as lead?
- **fullstack-developer** is excellent for database-heavy apps or microservices
- **nextjs-developer** specializes in the exact stack you need:
  - Next.js 14+ App Router
  - SEO-first architecture
  - Vercel deployment
  - TypeScript strict mode
  - Performance optimization built-in
- **Decision**: Use nextjs-developer as lead, backend-developer for database/APIs

### Why NOT wordpress-master?
- You explicitly requested "NOT WordPress"
- Next.js delivers better performance (critical for premium brand)
- Custom admin dashboard more flexible than WordPress admin
- Lower hosting costs with static generation
- Easier integration with Stripe and Constant Contact via APIs
- **Decision**: Pure custom Next.js stack

### Why NOT multi-agent-coordinator?
- Built for 100+ agent orchestration (you have 11 agents)
- Optimized for distributed systems (you have single website)
- Adds unnecessary complexity (message queues, pubsub, circuit breakers)
- **Decision**: agent-organizer for project coordination

### Why NOT skip seo-specialist until post-MVP?
- Event in 2026 means ranking time matters NOW
- Technical SEO architecture hard to retrofit (URL structure, schema)
- Organic traffic cheaper than paid ads for ongoing promotion
- Local SEO critical for Columbus market
- **Decision**: SEO specialist in Phase 1-2, not Phase 3

---

## Budget Optimization Tips

If you need to reduce the team size (e.g., budget constraints), here's how to consolidate:

### Minimum Viable Team (8 subagents)
**Merge these roles:**
1. **agent-organizer + project-manager** → project-manager handles both (save 1 agent)
2. **nextjs-developer + backend-developer** → nextjs-developer handles API routes + database (save 1 agent)
3. **ui-designer** → Use existing brand guidelines + Tailwind UI templates (save 1 agent, but risky for premium brand)

**Keep critical specialists:**
- payment-integration (non-negotiable for PCI compliance)
- seo-specialist (essential for organic ticket sales)
- react-specialist (complex interactive forms)
- qa-expert (payment bugs too costly)
- devops-engineer (deployment + monitoring)
- security-engineer (protects payment data)
- performance-engineer (premium brand needs fast site)

**Risks of consolidation:**
- Slower timeline (6-8 weeks → 8-10 weeks)
- Lower quality in UI/UX (generic templates vs custom design)
- More bugs (less specialization)

**Recommendation**: Keep full team for 6-8 week timeline

---

## Risk Mitigation

### Risk 1: Payment Integration Failure
**Impact**: Cannot sell tickets → Event cannot happen
**Mitigation**:
- Engage payment-integration specialist (not backend-developer alone)
- Use Stripe test mode extensively (week 3-4)
- Load test payment flow (500 concurrent transactions)
- Have backup payment method ready (PayPal as fallback)
- **Responsible**: payment-integration, qa-expert

### Risk 2: Timeline Slippage
**Impact**: Miss marketing window for early bird tickets
**Mitigation**:
- Weekly milestone tracking (project-manager)
- Daily blocker identification (agent-organizer)
- Scope protection (defer post-event survey to post-MVP if needed)
- Parallel execution in Phase 1 and Phase 2
- **Responsible**: project-manager, agent-organizer

### Risk 3: Poor SEO Ranking
**Impact**: Low organic traffic → Depend on expensive paid ads
**Mitigation**:
- Engage seo-specialist in Phase 1 (architecture)
- Implement event schema markup (boost Google Events visibility)
- Optimize Core Web Vitals early (performance-engineer in Phase 3)
- Create content calendar (content-marketer ongoing)
- **Responsible**: seo-specialist, nextjs-developer, performance-engineer

### Risk 4: Security Breach
**Impact**: Payment data leaked → Legal liability, brand damage
**Mitigation**:
- Never store payment data (Stripe handles tokenization)
- PCI DSS compliance verified (payment-integration + security-engineer)
- Penetration testing in Week 7 (security-engineer)
- Rate limiting on all forms (prevent spam/DDoS)
- **Responsible**: security-engineer, payment-integration

### Risk 5: Non-Technical Staff Cannot Maintain
**Impact**: Require expensive developer for every update
**Mitigation**:
- Build intuitive admin dashboard (backend-developer in Phase 3)
- Create video tutorials for common tasks (5-10 minute screencasts)
- Use Vercel deployment (one-click rollback if issues)
- Document common tasks in runbook (devops-engineer)
- **Responsible**: backend-developer, devops-engineer

---

## Post-MVP Roadmap (After Week 8)

Once the MVP launches, consider these enhancements for future years:

### Post-Event (Immediately After 2026 Event)
- **Subagent**: qa-expert
- **Task**: Deploy post-event survey form
- **Goal**: Collect feedback for 2027 event

### 2026-2027 Offseason
- **Subagent**: content-marketer + seo-specialist
- **Task**: Blog content ("Top 10 Bourbons Tasted", "2026 Event Recap")
- **Goal**: Build year-round organic traffic

### 6 Months Before 2027 Event
- **Subagent**: react-specialist
- **Task**: Add photo gallery from 2026 event
- **Goal**: Show social proof to 2027 attendees

### Advanced Features (If Budget Allows)
- **Virtual bourbon tasting** (webinar integration for remote attendees)
- **Mobile app** (engage mobile-developer for iOS/Android companion app)
- **Live auction bidding** (websocket-engineer for real-time bidding during event)

---

## Conclusion

### Recommended Team (11 Subagents)

**Phase 1 (Weeks 1-2)**: 5 subagents
1. agent-organizer (orchestration)
2. project-manager (delivery)
3. nextjs-developer (technical lead)
4. ui-designer (visual identity)
5. seo-specialist (SEO foundation)

**Phase 2 (Weeks 3-5)**: +6 subagents (11 total)
6. payment-integration (payment systems)
7. backend-developer (API + database)
8. react-specialist (frontend components)
9. content-marketer (content strategy)
10. seo-specialist (continued - on-page optimization)
11. qa-expert (quality assurance)

**Phase 3 (Weeks 6-8)**: +4 new subagents (15 total active, but many Phase 2 agents wind down)
12. devops-engineer (deployment)
13. backend-developer (continued - admin dashboard)
14. security-engineer (security hardening)
15. performance-engineer (performance optimization)

### Critical Success Factors
1. ✅ **payment-integration specialist** (not backend-developer alone) - PCI compliance non-negotiable
2. ✅ **seo-specialist in Phase 1-2** (not post-MVP) - Ranking time matters for 2026 event
3. ✅ **nextjs-developer as lead** (not fullstack) - SEO + performance + modern tooling
4. ✅ **agent-organizer for coordination** (not multi-agent-coordinator) - Right scale for 11 agents
5. ✅ **No WordPress** - Custom Next.js for performance, maintainability, and modern DX

### Timeline Confidence
- **6 weeks**: Aggressive but achievable with full team and minimal scope creep
- **8 weeks**: Comfortable with buffer for unforeseen issues
- **Recommended**: Plan for 7 weeks, have 1-week buffer

### Next Steps
1. **Week -1**: Engage agent-organizer and project-manager to refine this plan
2. **Week 0**: Kickoff with nextjs-developer, ui-designer, seo-specialist
3. **Week 1**: First sprint begins, daily standups start
4. **Week 2**: Design approval, architecture approval (Phase 1 gate)
5. **Week 3-5**: Feature development sprints (Phase 2)
6. **Week 6-8**: Optimization, security, launch prep (Phase 3)
7. **Week 8**: Production launch! 🎉

---

**Questions or adjustments needed?** This strategy assumes:
- 6-8 week timeline acceptable
- Budget supports 11-15 subagent engagements
- Simon Kenton Council available for weekly check-ins
- Stripe chosen as payment processor (alternatives: PayPal, Square)
- Constant Contact for email marketing (alternative: Mailchimp)
- Vercel for hosting (alternatives: AWS Amplify, Netlify, self-hosted)

**Ready to begin?** Start with `agent-organizer` to refine task breakdown and kickoff the project!
