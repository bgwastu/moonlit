"use client";

import { Component, type ReactNode } from "react";
import { Button, Container, Paper, Text, Title } from "@mantine/core";

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

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Container py="xl">
          <Paper p="lg" withBorder>
            <Title order={3} mb="sm">
              Something went wrong
            </Title>
            <Text c="dimmed" size="sm" mb="md">
              {this.state.error?.message || "An unexpected error occurred in the player."}
            </Text>
            <Button onClick={this.handleReset} variant="light">
              Try again
            </Button>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}
