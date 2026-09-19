import { Component } from "react";

// A render-time throw anywhere in the tree below this (a malformed API
// row hitting an unguarded .toFixed()/.map(), a bug in a new component)
// otherwise unmounts the whole React app, leaving a permanent blank white
// screen with no way back short of the user guessing to hit reload. This
// is the last line of defense, not a substitute for fixing the throw —
// plain hardcoded English rather than react-i18next, matching
// App.jsx's ConfigErrorScreen: the tree that would normally provide
// translations is exactly what just broke, so this can't assume it works.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] render crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card elev-lg" style={{ maxWidth: 440, padding: 28, gap: 12 }}>
          <div className="card-title" style={{ fontSize: 16 }}>Something went wrong</div>
          <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            This page hit an unexpected error and couldn't continue. Reloading usually fixes it —
            if it keeps happening, please let us know what you were doing when it broke.
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
