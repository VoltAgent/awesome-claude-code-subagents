# ADR-018: E2E Testing Architecture with Browser Automation

## Status
Accepted

## Date
2026-01-21

## Context

The Conveyor AI platform requires comprehensive end-to-end (E2E) testing to validate:
- User authentication flows
- Chat system functionality
- Cloud Function integrations
- Document parsing workflows
- Real-time features

Manual testing is time-consuming and error-prone. We need an automated E2E testing solution that:
1. Runs in a containerized environment (Cloud Run)
2. Uses browser automation for realistic user simulation
3. Integrates with CI/CD pipelines
4. Provides detailed test reports and screenshots
5. Can be triggered on-demand or scheduled

## Decision

We will implement an E2E testing service using:

### Technology Stack
- **Runtime**: Cloud Run (containerized, scalable)
- **Browser Automation**: `@claude-flow/browser` (Playwright-based)
- **Test Framework**: `@claude-flow/testing` (assertion library + reporters)
- **Browser**: Chromium (headless mode for CI, headed for debugging)
- **Credentials**: Google Secret Manager (secure storage)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E Test Runner (Cloud Run)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Test Suites  │    │   Browser    │    │   Reporter   │      │
│  │              │───▶│  Automation  │───▶│              │      │
│  │ - Auth       │    │  (Playwright)│    │ - Console    │      │
│  │ - Chat       │    │              │    │ - HTML       │      │
│  │ - Documents  │    │              │    │ - Screenshots│      │
│  │ - Functions  │    │              │    │ - Artifacts  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                                    │
│                             ▼                                    │
│                    ┌──────────────┐                             │
│                    │   Secret     │                             │
│                    │   Manager    │                             │
│                    │ (credentials)│                             │
│                    └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Target Applications                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Chat System  │    │    Cloud     │    │   Airtable   │      │
│  │ (Cloud Run)  │    │  Functions   │    │     API      │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Test Suites

1. **Authentication Tests**
   - Login with valid credentials
   - Login with invalid credentials
   - Session persistence
   - Logout functionality

2. **Chat System Tests**
   - Send messages
   - Receive AI responses
   - Slash commands (/help, /search, /parse, etc.)
   - Natural language queries
   - Error handling

3. **Document Parsing Tests**
   - Parse documents from Airtable records
   - Verify extraction results
   - Handle unsupported formats

4. **Cloud Function Tests**
   - Health checks
   - API response validation
   - Error scenarios

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/run` | POST | Run all test suites |
| `/run/:suite` | POST | Run specific suite |
| `/results` | GET | Get latest results |
| `/results/:runId` | GET | Get specific run results |
| `/screenshots/:runId` | GET | Get screenshots |

### Request/Response Schema

**Run Tests Request:**
```json
{
  "suites": ["auth", "chat", "documents"],
  "headless": true,
  "timeout": 60000,
  "retries": 2,
  "screenshot": "on-failure"
}
```

**Run Tests Response:**
```json
{
  "success": true,
  "runId": "run-123456",
  "summary": {
    "total": 25,
    "passed": 24,
    "failed": 1,
    "skipped": 0,
    "duration": 45230
  },
  "suites": [
    {
      "name": "auth",
      "passed": 5,
      "failed": 0,
      "tests": [...]
    }
  ],
  "artifacts": {
    "screenshots": ["url1", "url2"],
    "report": "html-report-url"
  }
}
```

### Security Considerations

1. **Credentials Storage**: All test credentials stored in Google Secret Manager
2. **Network Isolation**: Cloud Run service in private VPC
3. **Access Control**: IAM-based authentication for API access
4. **Audit Logging**: All test runs logged with Cloud Logging
5. **Data Protection**: No PII in test reports, credentials masked

### Environment Variables

```bash
# Required
E2E_TEST_EMAIL=<from-secret-manager>
E2E_TEST_PASSWORD=<from-secret-manager>
CHAT_SYSTEM_URL=https://chat-system-hwqrrwrlna-uc.a.run.app

# Optional
HEADLESS=true
SCREENSHOT_MODE=on-failure
TEST_TIMEOUT=60000
MAX_RETRIES=2
```

## Consequences

### Positive
- Automated regression testing
- Consistent test execution environment
- Scalable (Cloud Run auto-scaling)
- Cost-effective (pay per use)
- Integrated with GCP ecosystem
- Screenshots for debugging

### Negative
- Browser automation can be flaky
- Initial setup complexity
- Chromium container size (~500MB)
- Cold start latency (~5-10s)

### Mitigations
- Retry logic for flaky tests
- Warm-up endpoints
- Multi-stage Docker builds
- Test isolation patterns

## Implementation

### Phase 1: Core Infrastructure (Completed)
- Cloud Run service setup
- Secret Manager integration
- Basic auth test suite

### Phase 2: Test Suites (Completed)
- Chat system tests
- Document parsing tests
- Cloud function tests

### Phase 3: Optimization (Completed)
- Parallel test execution
- Caching strategies
- Performance tuning

---

## Detailed Implementation

### Hybrid Browser Architecture

The E2E runner uses a **hybrid browser approach** that combines:
1. **Playwright** for real browser automation
2. **@claude-flow/browser API** for AI-optimized element references

This design was chosen because `@claude-flow/browser`'s `createBrowserService()` requires the `agent-browser` CLI which doesn't launch browsers directly in containerized environments.

#### Browser Wrapper Implementation

```javascript
// infrastructure/gcp/e2e-runner/src/run-tests.js

import { chromium } from 'playwright';

async function createBrowser(options, runId) {
  // Launch real Playwright browser with container-safe flags
  const playwrightBrowser = await chromium.launch({
    headless: options.headless !== false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await playwrightBrowser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36...',
  });

  const page = await context.newPage();

  // Return @claude-flow/browser compatible API
  return {
    async open(url) { /* ... */ },
    async snapshot(opts) { /* ... */ },
    async fill(target, value) { /* ... */ },
    async click(target) { /* ... */ },
    async press(key) { /* ... */ },
    async wait(opts) { /* ... */ },
    async screenshot(opts) { /* ... */ },
    async eval(script) { /* ... */ },
    async close() { /* ... */ },

    // Trajectory learning integration
    startTrajectory(description) { /* ... */ },
    async endTrajectory(success, verdict) { /* ... */ },
  };
}
```

### AI-Optimized Element References

The `snapshot()` function creates element references (`@e1`, `@e2`, etc.) that abstract DOM complexity:

```javascript
async snapshot({ interactive = false } = {}) {
  const selector = interactive
    ? 'button, input, textarea, select, a[href], [role="button"], [role="textbox"], [contenteditable="true"]'
    : 'button, input, textarea, select, a, div, span, p';

  const elements = await page.$eval(selector, (els) =>
    els.slice(0, 200).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.innerText?.slice(0, 100)?.trim() || '',
      className: el.className || '',
    }))
  );

  // Create refs map: @e1, @e2, etc.
  const refs = {};
  elements.forEach((el, idx) => {
    refs[`@e${idx + 1}`] = el;
  });

  return { refs };
}
```

### Flexible Element Detection Strategy

Tests use multi-criteria element detection to handle various UI implementations:

```javascript
async function getChatInputRef() {
  const snapshot = await browser.snapshot({ interactive: true });
  const entries = Object.entries(snapshot.refs || {});

  const inputRef = entries.find(([_, ref]) => (
    // By ARIA role
    ref.role === 'textbox' ||
    ref.role === 'searchbox' ||
    // By HTML tag
    ref.tag === 'input' ||
    ref.tag === 'textarea' ||
    // By accessible name
    ref.name?.toLowerCase().includes('message') ||
    ref.name?.toLowerCase().includes('command') ||
    ref.name?.toLowerCase().includes('type') ||
    ref.name?.toLowerCase().includes('ask') ||
    // By CSS class
    ref.className?.includes('input') ||
    ref.className?.includes('message')
  ));

  if (!inputRef) throw new Error('Chat input not found');
  return inputRef[0]; // Returns @e1, @e2, etc.
}
```

### Trajectory Learning Integration

Each test run generates trajectory data for ReasoningBank/SONA pattern learning:

```javascript
// Start trajectory before test suite
const trajectoryId = browser.startTrajectory('E2E: Chat system validation');

// Run tests...

// End trajectory with results
await browser.endTrajectory(results.failed === 0, {
  total: results.total,
  passed: results.passed,
  failed: results.failed,
  duration: results.duration,
});
```

Trajectory data is stored in `/tmp/e2e-trajectories/` for later training.

### Test Suite Structure

Each test suite follows a consistent pattern:

```javascript
// infrastructure/gcp/e2e-runner/src/tests/<suite>.js

export async function run<Suite>Tests({
  browser,      // Browser instance
  credentials,  // { email, password }
  options,      // { baseUrl, headless, timeout }
  runId,        // Unique run identifier
  screenshotDir // Path for failure screenshots
}) {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: [],
    screenshots: [],
  };

  // Test helper with auto-screenshot on failure
  async function runTest(name, testFn) {
    results.total++;
    try {
      await testFn();
      results.passed++;
      results.tests.push({ name, status: 'passed', duration });
    } catch (error) {
      results.failed++;
      const screenshotPath = path.join(screenshotDir, `${name}-failure.png`);
      await browser.screenshot({ path: screenshotPath, fullPage: true });
      results.tests.push({ name, status: 'failed', error: error.message });
    }
  }

  // Common helpers
  async function sendMessage(message) { /* ... */ }
  async function waitForResponse(timeout = 30000) { /* ... */ }

  // Navigate to app
  await browser.open(options.baseUrl);
  await browser.wait({ timeout: 3000 });

  // Run tests
  await runTest('test name', async () => { /* ... */ });

  return results;
}
```

### Test Suites Overview

| Suite | Tests | Purpose |
|-------|-------|---------|
| **auth.js** | 5 | Login flows, form validation, redirects, session handling |
| **chat.js** | 8 | Message sending, /help, /search, commands, history, responsiveness |
| **documents.js** | 6 | /parse command, document extraction, error handling |
| **functions.js** | 8 | Airtable queries, DB queries, search, simulation, research |

### Container Configuration

**Dockerfile:**
```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "src/index.js"]
```

**Key Container Flags:**
- `--no-sandbox` - Required for containerized Chromium
- `--disable-setuid-sandbox` - Security namespace workaround
- `--disable-dev-shm-usage` - Use /tmp instead of /dev/shm (limited in containers)
- `--disable-gpu` - No GPU in Cloud Run

### Deployment

**Build and Deploy:**
```bash
cd infrastructure/gcp/e2e-runner

# Build with Cloud Build
gcloud builds submit --config=cloudbuild.yaml --substitutions=_VERSION=v10

# Deploy to Cloud Run (if not using cloudbuild.yaml deploy step)
gcloud run deploy e2e-runner \
  --image=gcr.io/PROJECT_ID/e2e-runner:v10 \
  --platform=managed \
  --region=us-central1 \
  --memory=2Gi \
  --timeout=900 \
  --set-secrets=E2E_TEST_EMAIL=e2e-test-email:latest,E2E_TEST_PASSWORD=e2e-test-password:latest
```

**Cloud Build Configuration:**
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/e2e-runner:${_VERSION}', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/e2e-runner:${_VERSION}']

images:
  - 'gcr.io/$PROJECT_ID/e2e-runner:${_VERSION}'

substitutions:
  _VERSION: 'latest'

timeout: '1200s'
```

### Usage Examples

**Run All Tests:**
```bash
curl -X POST https://e2e-runner-xxxxx-uc.a.run.app/run \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://chat-system-xxxxx-uc.a.run.app",
    "suites": ["auth", "chat", "documents", "functions"],
    "headless": true
  }'
```

**Run Specific Suite:**
```bash
curl -X POST https://e2e-runner-xxxxx-uc.a.run.app/run/chat \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://chat-system-xxxxx-uc.a.run.app"}'
```

**Get Results:**
```bash
curl https://e2e-runner-xxxxx-uc.a.run.app/results/run-20260121-123456
```

### Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| Tests complete in <100ms | Browser not launching | Check Playwright installation, container flags |
| "Chat input not found" | Strict element detection | Use flexible detection (roles, tags, classes) |
| Timeout waiting for response | Slow app or wrong selector | Increase timeout, verify app is responsive |
| Screenshots empty | Screenshot before page load | Add explicit wait after navigation |
| "Navigation timeout" | `networkidle` too strict | Use `domcontentloaded` + explicit wait |
| Tests pass locally, fail in container | Different environment | Ensure same Chrome version, check sandbox flags |

### Performance Metrics

| Metric | Value |
|--------|-------|
| Total Tests | 27 |
| Pass Rate | 100% |
| Full Suite Duration | ~113 seconds |
| Container Cold Start | ~5-10 seconds |
| Build Time | ~11-12 minutes |
| Image Size | ~1.2 GB (Playwright base) |

### Future Enhancements

1. **Parallel Test Execution** - Run suites concurrently
2. **Visual Regression** - Screenshot comparison testing
3. **Performance Metrics** - Lighthouse integration
4. **CI/CD Triggers** - Run on PR merge
5. **Slack Notifications** - Alert on failures
6. **Test Coverage** - Track which UI paths are tested

## References

- [Playwright Documentation](https://playwright.dev/)
- [@claude-flow/browser Package](https://www.npmjs.com/package/@claude-flow/browser)
- [@claude-flow/testing Package](https://www.npmjs.com/package/@claude-flow/testing)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [ADR-014: Chat System Architecture](./ADR-014-CHAT-SYSTEM-ARCHITECTURE.md)
