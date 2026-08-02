import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MAB interface error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ background: "#f4f7f9", color: "#173247", display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
        <section style={{ background: "white", border: "1px solid #dbe6ed", borderRadius: 14, maxWidth: 560, padding: 24 }}>
          <h1 style={{ marginTop: 0 }}>The workspace could not be displayed</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => { window.localStorage.removeItem("mab-task-allocator.language"); window.location.reload(); }} type="button">Reset display and reload</button>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);
