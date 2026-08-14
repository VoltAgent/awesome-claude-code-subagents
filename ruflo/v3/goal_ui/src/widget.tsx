import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import Index from "./pages/Index";
import { Toaster } from "./components/ui/toaster";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

interface WidgetConfig {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  cardBackgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  defaultGoal?: string;
}

declare global {
  interface Window {
    RufloResearchWidgetConfig?: WidgetConfig;
    RufloResearchWidget?: {
      init: (containerId?: string) => void;
      version: string;
    };
  }
}

// Widget initialization function
function initRufloResearchWidget(containerId: string = "ruflo-research-widget-container"): void {
  console.log("[RuFlo Research] Starting initialization...");
  
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[RuFlo Research] Container with id "${containerId}" not found`);
    return;
  }

  console.log("[RuFlo Research] Container found:", containerId);

  // Apply widget config if provided
  const config = window.RufloResearchWidgetConfig;
  if (config) {
    console.log("[RuFlo Research] Applying configuration:", config);
    if (config.primaryColor) container.style.setProperty("--primary", config.primaryColor);
    if (config.accentColor) container.style.setProperty("--accent", config.accentColor);
    if (config.backgroundColor) container.style.setProperty("--background", config.backgroundColor);
    if (config.cardBackgroundColor) container.style.setProperty("--card", config.cardBackgroundColor);
    if (config.textColor) container.style.setProperty("--foreground", config.textColor);
    if (config.fontFamily) container.style.fontFamily = config.fontFamily;
  }

  try {
    const root = createRoot(container);
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          BrowserRouter,
          null,
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(Index, null),
            React.createElement(Toaster, null)
          )
        )
      )
    );

    console.log("[RuFlo Research] ✅ Successfully initialized and rendered");
  } catch (error) {
    console.error("[RuFlo Research] ❌ Initialization error:", error);
  }
}

// Auto-initialize on DOM ready
function autoInit(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log("[RuFlo Research] DOM ready, auto-initializing...");
      initRufloResearchWidget();
    });
  } else {
    console.log("[RuFlo Research] DOM already loaded, initializing...");
    // Use setTimeout to ensure script has fully loaded
    setTimeout(() => initRufloResearchWidget(), 0);
  }
}

// Initialize only in browser environment
if (typeof window !== "undefined") {
  // Expose global API
  window.RufloResearchWidget = {
    init: initRufloResearchWidget,
    version: "1.0.0",
  };
  
  console.log("[RuFlo Research] API exposed on window.RufloResearchWidget");
  
  // Auto-initialize
  autoInit();
}

export default initRufloResearchWidget;
