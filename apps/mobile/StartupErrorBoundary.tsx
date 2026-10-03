import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Share, View } from 'react-native';
import { palettes } from '@open-outdoor/shared';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductDisclosure } from './ProductComponents';

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
          App could not open
        </Text>
        <Text style={styles.copy}>Your saved data has not been deleted.</Text>
        <ProductDisclosure title="Technical details">
          <Text accessibilityRole="alert" selectable style={styles.error}>
            {this.state.message}
          </Text>
        </ProductDisclosure>
        <View style={{ marginTop: 24 }}>
          <ProductButton
            label="Share error details"
            hint="Share the startup error message"
            onPress={() => Share.share({ message: this.state.message! })}
          />
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palettes.light.background,
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  copy: {
    color: palettes.light.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  error: {
    backgroundColor: '#ffffff',
    borderColor: palettes.light.border,
    borderRadius: 8,
    borderWidth: 2,
    color: palettes.light.text,
    fontSize: 15,
    padding: 12,
  },
  heading: {
    color: palettes.light.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
});
