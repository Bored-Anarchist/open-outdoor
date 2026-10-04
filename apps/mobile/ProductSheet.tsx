import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { ProductHeader, usePalette } from './ProductComponents';

/** System sheet supports Back, screen-reader escape, keyboard avoidance and text reflow. */
export function ProductSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 22 }}>
              <ProductHeader title={title} onBack={onClose} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 22,
                paddingTop: 8,
                paddingBottom: 32,
                gap: 16,
              }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
