import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="hud-canvas-grid flex min-h-screen items-center justify-center p-6">
          <div className="hud-layer-3 max-w-md rounded-md p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-[#FFB4AB]" />
            <h1 className="mt-3 font-display text-xl font-bold text-[#E2E2EC]">
              Interface Recovery Mode
            </h1>
            <p className="mt-2 text-sm text-[#B9CACB]">
              Your saved STRYDE progress remains safely stored in your account.
            </p>
            <p className="mt-2 rounded border border-white/10 bg-[#131622] p-2 font-mono text-xs text-[#FFB4AB]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="hud-btn-primary mt-5 inline-flex min-h-[40px] items-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold"
            >
              <RotateCcw className="h-4 w-4" />
              Reload STRYDE
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unable to render this section.',
    };
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="hud-layer-1 rounded-md border border-[#FFB4AB]/35 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[#FFB4AB]" />
          <h2 className="mt-2 font-display text-lg font-semibold text-[#E2E2EC]">
            Section Encountered an Error
          </h2>
          <p className="mt-1 text-xs text-[#B9CACB]">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-4 inline-flex items-center gap-1.5 rounded bg-[#00F0FF] px-4 py-2 font-display text-xs font-semibold text-[#08090C]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry Section
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
