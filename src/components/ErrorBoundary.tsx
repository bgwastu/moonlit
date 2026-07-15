"use client";

import { Component, type ReactNode } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Moonlit] ErrorBoundary", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <ErrorScreen
          message={
            this.state.error?.message || "An unexpected error occurred in the player."
          }
          onPrimary={this.handleReset}
          fullViewport={false}
        />
      );
    }

    return this.props.children;
  }
}
