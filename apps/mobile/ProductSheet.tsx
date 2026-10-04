import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, type ReactNode } from 'react';
import { ProductHeader, usePalette } from './ProductComponents';

/** System sheet supports Back, screen-reader escape, keyboard avoidance and text reflow. */
export function ProductSheet({
  title,
  visible,
  onClose,
  onDismiss,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const p = usePalette();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [visible, title]);
  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
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
              ref={scroll}
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
