import { View } from 'react-native';
import { ProductText as Text } from './accessibility';
import { ProductButton } from './ProductComponents';
import type { LocationAccessService } from './useLocationAccess';

export function LocationAccessControls({
  access,
  disabled = false,
}: {
  access: LocationAccessService;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityLiveRegion="polite">{access.message}</Text>
      <ProductButton
        label={access.label}
        hint={access.hint}
        disabled={disabled}
        busy={access.busy}
        onPress={access.request}
      />
    </View>
  );
}
