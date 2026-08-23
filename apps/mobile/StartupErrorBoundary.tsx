import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

interface StartupErrorBoundaryProps {
  readonly children?: ReactNode;
}

interface StartupErrorBoundaryState {
  readonly message: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class StartupErrorBoundary extends Component<
  StartupErrorBoundaryProps,
  StartupErrorBoundaryState
> {
  override state: StartupErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): StartupErrorBoundaryState {
    return { message: errorMessage(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Open Outdoor startup render failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.heading}>
          Open Outdoor startup diagnostic
        </Text>
        <Text style={styles.copy}>
          The app encountered an unexpected render error. Share the message below.
        </Text>
        <Text accessibilityRole="alert" selectable style={styles.error}>
          {this.state.message}
        </Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff0ee',
    flexGrow: 1,
    padding: 24,
  },
  copy: {
    color: '#5f1711',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  error: {
    backgroundColor: '#ffffff',
    borderColor: '#a5251b',
    borderRadius: 8,
    borderWidth: 2,
    color: '#5f1711',
    fontSize: 15,
    padding: 12,
  },
  heading: {
    color: '#7b1d15',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
});
