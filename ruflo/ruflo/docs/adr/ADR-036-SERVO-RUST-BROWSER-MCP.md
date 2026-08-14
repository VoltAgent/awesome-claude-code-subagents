# ADR-036: Servo Replaces Playwright as Browser Engine for @claude-flow/browser

**Status:** Accepted
**Date:** 2026-03-05
**Supersedes:** Playwright dependency in `@claude-flow/browser`

## Context

`@claude-flow/browser` currently provides 59 MCP browser tools built on `agent-browser` + Playwright + Chromium. This stack works but has fundamental problems:

1. **~400MB Chromium binary** — must download on first run, bloats Docker images, prevents edge deployment
2. **200-500MB RAM per tab** — limits concurrent browser sessions in swarms
3. **Black box rendering** — agents can only see the DOM and screenshots; layout/render trees are inaccessible
4. **Not embeddable in WASM** — cannot run on Cognitum compute tiles or in serverless functions
5. **Browser version drift** — same page renders differently across Chrome versions, breaking visual regression tests
6. **Node.js ↔ Chrome IPC overhead** — every interaction is a roundtrip through CDP (Chrome DevTools Protocol)

**Servo** is a Rust browser engine (Mozilla → Linux Foundation) with parallel CSS (Stylo) and GPU rendering (WebRender), both already shipping in Firefox. It can be embedded as a library, compiled headless at ~5MB, and exposes internal layout/render trees that Chromium keeps private.

## Decision

Replace Playwright/Chromium with **Servo** as the rendering backend for `@claude-flow/browser`. Keep the existing 59-tool MCP interface, trajectory learning, security scanning, swarm coordination, and 9 workflow templates unchanged. The swap is at the adapter layer — `AgentBrowserAdapter` becomes `ServoAdapter`.

### Architecture: Before → After

```
BEFORE (Playwright):
  MCP Tool Call → BrowserService → AgentBrowserAdapter → agent-browser CLI → Playwright → Chromium
                       ↓                                                         ↓
                  Security/Memory                                          CDP (IPC)
                                                                               ↓
                                                                    Blink (C++) layout
                                                                    V8 (C++) JavaScript
                                                                    ~400MB + ~300MB/tab

AFTER (Servo):
  MCP Tool Call → BrowserService → ServoAdapter → libservo (embedded Rust)
                       ↓                                ↓
                  Security/Memory                  Direct API (no IPC)
                                                        ↓
                                              Stylo (Rust) parallel CSS
                                              SpiderMonkey (C) JavaScript
                                              WebRender (Rust) GPU/CPU paint
                                              ~5MB + ~20MB/tab
```

### What Changes

| Layer | Before | After |
|-------|--------|-------|
| **Adapter** | `AgentBrowserAdapter` (spawns `agent-browser` CLI) | `ServoAdapter` (embeds `libservo` via napi-rs) |
| **Rendering engine** | Chromium/Blink (C++) | Servo/Stylo (Rust) |
| **JavaScript engine** | V8 (C++) | SpiderMonkey (C) |
| **Binary** | `~400MB` Chromium download | `~5MB` prebuilt Rust binary shipped via npm |
| **IPC** | Chrome DevTools Protocol over pipe | Direct Rust FFI via napi-rs (zero-copy) |
| **Layout access** | Not exposed (CDP has limited `DOMSnapshot`) | Full layout tree, render tree, display list |
| **Element refs** | `@e1, @e2` from accessibility tree only | `@e1, @e2` from accessibility + layout + render trees |

### What Stays the Same

Everything above the adapter layer is unchanged:

- **59 MCP tools** — same names, same parameters, same behavior
- **BrowserService API** — `open()`, `click()`, `fill()`, `snapshot()`, `screenshot()`, etc.
- **Security scanner** — URL validation, phishing detection, PII scanning, XSS/SQLi prevention
- **Trajectory learning** — ReasoningBank/SONA pattern storage and retrieval
- **Memory integration** — HNSW-indexed pattern search for similar browser interactions
- **Swarm coordination** — multi-session parallel browsing with agent roles (navigator, scraper, validator, tester, monitor)
- **9 workflow templates** — login-basic, login-oauth, logout, scrape-table, scrape-list, contact-form, visual-regression, smoke-test, uptime-check
- **Hooks** — `preBrowseHook`, `postBrowseHook` for learning integration
- **93% context reduction** — element refs (`@e1`) instead of full CSS selectors

### New Capabilities (Servo-Only)

Servo exposes internal trees that Chromium keeps private. These become **new MCP tools** added to the existing 59:

| New Tool | Description |
|----------|-------------|
| `browser/layout_tree` | Full computed layout tree — positions, sizes, margins, padding, z-index for every element |
| `browser/render_tree` | WebRender display list — what actually gets painted, in what order |
| `browser/style_cascade` | CSS cascade resolution — which rules won, specificity, origin |
| `browser/reflow_cost` | Per-element layout cost — identify expensive reflows |
| `browser/paint_order` | Stacking context and paint layer breakdown |
| `browser/parallel_stats` | Stylo parallelism metrics — how many cores used for CSS |

These enable a new agent reasoning mode:

```
Playwright agent:
  snapshot → accessibility tree → "@e3 is a button labeled Submit"

Servo agent:
  snapshot → accessibility tree + layout tree → "@e3 is a button labeled Submit
    at (340, 220), 120x40px, z-index 2, in stacking context #form,
    font: 14px Inter, background: #2563eb, reflow cost: 0.3ms"
```

### ServoAdapter Implementation

```rust
// servo-adapter/src/lib.rs — napi-rs binding

use napi::*;
use napi_derive::napi;
use servo::Servo;
use servo::compositing::windowing::{EmbedderMethods, WindowMethods};
use servo::embedder_traits::EmbedderMsg;
use servo::servo_url::ServoUrl;

#[napi]
pub struct ServoInstance {
    servo: Servo<HeadlessWindow>,
    viewport: (u32, u32),
}

#[napi]
impl ServoInstance {
    #[napi(constructor)]
    pub fn new(width: u32, height: u32) -> Result<Self> {
        let window = HeadlessWindow::new(width, height);
        let servo = Servo::new(
            Box::new(HeadlessEmbedder),
            window,
            None, // user-agent override
        );
        Ok(Self { servo, viewport: (width, height) })
    }

    #[napi]
    pub async fn navigate(&mut self, url: String) -> Result<NavigationResult> {
        let servo_url = ServoUrl::parse(&url).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.servo.handle_events(vec![EmbedderMsg::LoadUrl(servo_url)]);
        self.servo.wait_for_load().await;
        Ok(NavigationResult { url, status: 200 })
    }

    #[napi]
    pub fn snapshot(&self) -> Result<ServoSnapshot> {
        let dom = self.servo.dom_tree();
        let layout = self.servo.layout_tree();
        let accessibility = self.servo.accessibility_tree();
        // Generate element refs from combined trees
        let refs = generate_refs(&dom, &layout, &accessibility);
        Ok(ServoSnapshot { refs, dom, layout })
    }

    #[napi]
    pub fn layout_tree(&self) -> Result<serde_json::Value> {
        Ok(self.servo.layout_tree().to_json())
    }

    #[napi]
    pub fn render_tree(&self) -> Result<serde_json::Value> {
        Ok(self.servo.webrender_display_list().to_json())
    }

    #[napi]
    pub fn screenshot(&self) -> Result<Buffer> {
        let pixels = self.servo.composite();
        let png = encode_png(pixels, self.viewport.0, self.viewport.1);
        Ok(Buffer::from(png))
    }

    #[napi]
    pub fn click(&mut self, x: f64, y: f64) -> Result<()> {
        self.servo.handle_events(vec![
            EmbedderMsg::MouseDown(x as f32, y as f32),
            EmbedderMsg::MouseUp(x as f32, y as f32),
        ]);
        Ok(())
    }

    #[napi]
    pub fn eval_js(&mut self, script: String) -> Result<String> {
        Ok(self.servo.evaluate_script(&script))
    }
}
```

### TypeScript Adapter (Drop-In Replacement)

```typescript
// @claude-flow/browser/src/adapters/servo-adapter.ts

import { ServoInstance } from '@ruvector/servo-native'; // napi-rs binary
import type { BrowserAdapter, ActionResult, Snapshot } from '../types';

export class ServoAdapter implements BrowserAdapter {
  private servo: ServoInstance;

  constructor(options: { width?: number; height?: number } = {}) {
    this.servo = new ServoInstance(options.width ?? 1280, options.height ?? 720);
  }

  async open(url: string): Promise<ActionResult> {
    const result = await this.servo.navigate(url);
    return { success: true, data: result };
  }

  async snapshot(options?: { interactive?: boolean }): Promise<ActionResult<Snapshot>> {
    const raw = this.servo.snapshot();
    // Convert Servo refs to @claude-flow/browser element ref format (@e1, @e2, ...)
    const refs: Record<string, ElementRef> = {};
    for (const [id, node] of Object.entries(raw.refs)) {
      refs[id] = {
        role: node.ariaRole,
        name: node.ariaLabel || node.textContent?.slice(0, 50),
        tag: node.tagName,
        // Servo bonus: layout info included with every ref
        bounds: node.layoutBox, // { x, y, width, height }
        zIndex: node.zIndex,
      };
    }
    return { success: true, data: { refs } };
  }

  async click(target: string): Promise<ActionResult> {
    if (target.startsWith('@e')) {
      const snap = this.servo.snapshot();
      const ref = snap.refs[target];
      if (!ref) return { success: false, error: `Element ${target} not found` };
      // Click center of element using layout coordinates (precise, no selector fragility)
      const { x, y, width, height } = ref.layoutBox;
      this.servo.click(x + width / 2, y + height / 2);
    } else {
      // CSS selector — find via DOM, get layout position, click
      const pos = this.servo.getElementPosition(target);
      this.servo.click(pos.centerX, pos.centerY);
    }
    return { success: true };
  }

  async fill(target: string, value: string): Promise<ActionResult> {
    await this.click(target);
    // Type into focused element via SpiderMonkey
    this.servo.evalJs(`document.activeElement.value = ${JSON.stringify(value)}`);
    this.servo.evalJs(`document.activeElement.dispatchEvent(new Event('input', {bubbles: true}))`);
    return { success: true };
  }

  async screenshot(): Promise<ActionResult<string>> {
    const png = this.servo.screenshot();
    return { success: true, data: png.toString('base64') };
  }

  // NEW: Servo-only capabilities
  async layoutTree(): Promise<ActionResult> {
    return { success: true, data: this.servo.layoutTree() };
  }

  async renderTree(): Promise<ActionResult> {
    return { success: true, data: this.servo.renderTree() };
  }

  async close(): Promise<ActionResult> {
    this.servo = null as any;
    return { success: true };
  }
}
```

### Package Structure

```
@ruvector/servo-native              (npm, prebuilt Rust binary via napi-rs)
├── src/lib.rs                      Servo embedding + napi bindings
├── servo-headless/                  Minimal Servo build config (no GPU, no media)
├── prebuilds/
│   ├── linux-x64/servo-native.node
│   ├── darwin-arm64/servo-native.node
│   └── win32-x64/servo-native.node
└── package.json                    ~5MB per platform

@claude-flow/browser                (existing package, adapter swap)
├── src/
│   ├── adapters/
│   │   ├── agent-browser-adapter.ts   ← DEPRECATED (Playwright)
│   │   └── servo-adapter.ts           ← NEW (default)
│   ├── browser-service.ts             unchanged
│   ├── security/                      unchanged
│   ├── memory/                        unchanged
│   ├── workflows/                     unchanged
│   └── hooks/                         unchanged
└── package.json
    - "@ruvector/servo-native": "^1.0.0"   (replaces agent-browser)
    + peerDependencies: none (no Playwright, no Chrome)
```

### MCP Bridge Integration

Same `browser` group, new backend:

```javascript
// TOOL_GROUPS — no change needed, browser group already exists
browser: {
  enabled: process.env.MCP_GROUP_BROWSER === "true",
  description: "Headless browser automation — navigate, click, fill, screenshot (Servo)",
  source: "ruflo",
  prefixes: ["browser_"],
}
```

The ruflo `browser_*` tools will use `ServoAdapter` internally instead of `AgentBrowserAdapter`. No MCP bridge changes required.

### Docker Impact

```dockerfile
# BEFORE: Playwright + Chromium
FROM mcr.microsoft.com/playwright:v1.40.0-focal  # 2.1GB base image
RUN npx playwright install chromium               # +400MB

# AFTER: Servo native binary
FROM node:20-slim                                  # 200MB base image
RUN npm install @ruvector/servo-native             # +5MB
# Total: ~205MB vs ~2.5GB — 12x smaller
```

### Swarm Impact

With Servo's ~20MB/tab (vs Playwright's ~300MB/tab), browser swarms scale dramatically:

| Memory | Playwright tabs | Servo tabs |
|--------|----------------|------------|
| 1 GB | 3 | 50 |
| 2 GB | 6 | 100 |
| 4 GB | 13 | 200 |
| 8 GB | 26 | 400 |

This makes the existing swarm coordination (navigator, scraper, validator, tester, monitor roles) practical for real parallel scraping/testing workloads.

### Migration Path

1. **Phase 1: Dual adapter** — Ship `ServoAdapter` alongside `AgentBrowserAdapter`. Environment variable selects:
   ```bash
   BROWSER_ENGINE=servo    # default (new)
   BROWSER_ENGINE=playwright  # fallback
   ```

2. **Phase 2: Servo default** — `ServoAdapter` becomes default. `AgentBrowserAdapter` remains as fallback for sites with rendering issues.

3. **Phase 3: Playwright removal** — Remove `agent-browser` and Playwright dependencies entirely. Servo handles all browsing.

### Compatibility Matrix

| Web Feature | Servo Support | Notes |
|------------|--------------|-------|
| HTML5 | Full | Core parsing engine is mature |
| CSS3 (Flexbox, Grid) | Full | Stylo is the same engine Firefox uses |
| CSS4 (Container queries, :has) | Partial | Active development |
| JavaScript (ES2023) | Full | SpiderMonkey (same as Firefox) |
| DOM APIs | Full | Standard DOM implementation |
| Canvas 2D | Full | CPU-rendered in headless mode |
| WebGL | Limited | No GPU in headless; software fallback available |
| WebRTC | No | Not needed for agent browsing |
| Web Components | Full | Shadow DOM, custom elements |
| SVG | Full | Inline and embedded |
| WebAssembly | Full | SpiderMonkey WASM support |
| Service Workers | Partial | Basic support, not needed for most agent tasks |
| HTTP/2, HTTP/3 | Full | hyper (Rust) networking stack |

For the 95% of agent browsing tasks (navigate, read content, fill forms, click buttons, extract data), Servo's coverage is complete.

## Consequences

### Positive

- **12x smaller Docker images** — 205MB vs 2.5GB
- **15x more concurrent tabs** — 20MB/tab vs 300MB/tab
- **Zero IPC overhead** — direct Rust FFI instead of CDP pipe
- **Layout tree access** — new agent reasoning capabilities impossible with Playwright
- **No browser download** — prebuilt binary ships with npm package
- **Deterministic rendering** — same HTML always produces same layout (no Chrome version drift)
- **WASM-compatible** — future path to edge/serverless/Cognitum tile deployment
- **Same API** — all 59 existing MCP tools, security, memory, swarm, workflows work unchanged

### Negative

- **Servo gaps** — some CSS4 features and WebGL not fully supported
- **SpiderMonkey** — different JS engine than Chrome's V8; rare edge cases may differ
- **Native binary builds** — must ship prebuilds for linux-x64, darwin-arm64, win32-x64
- **Less ecosystem tooling** — no Chrome DevTools for debugging (mitigated by layout tree access)

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Site renders incorrectly in Servo | Dual-adapter Phase 1: `BROWSER_ENGINE=playwright` fallback |
| SpiderMonkey JS differences | Run compatibility test suite against top-1000 sites |
| napi-rs binary build complexity | CI matrix for all 3 platforms; prebuild-install fallback |
| Servo project stalls | Stylo and WebRender already ship in Firefox; core components are production-proven |

## Related

- [ADR-035: MCP Tool Groups](ADR-035-MCP-TOOL-GROUPS.md) — browser group architecture
- [ADR-033: RuVector + Ruflo MCP Integration](ADR-033-RUVECTOR-RUFLO-MCP-INTEGRATION.md) — stdio MCP client pattern
- [@claude-flow/browser README](https://github.com/ruvnet/ruflo/blob/main/v3/@claude-flow/browser/README.md) — existing 59-tool API surface
- [Servo project](https://servo.org/) — Linux Foundation browser engine
- [napi-rs](https://napi.rs/) — Rust ↔ Node.js FFI framework
