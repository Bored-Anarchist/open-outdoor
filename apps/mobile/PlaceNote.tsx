import { TextInput, View } from 'react-native';
import { ProductText as Text } from './accessibility';
import { ProductButton, usePalette } from './ProductComponents';
import type { PlaceJournalService } from './privatePersistence';
import { usePlaceJournal, type JournalPlace } from './usePlaceJournal';

/** Shared by Explore and Saved so notes remain accessible after their catalog is removed. */
export function PlaceNote({
  place,
  service,
}: {
  place: JournalPlace;
  service: PlaceJournalService | null;
}) {
  const p = usePalette();
  const journal = usePlaceJournal(service, place);
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
        {place.name}
      </Text>
      <TextInput
        accessibilityLabel={`Private note for ${place.name}`}
        accessibilityHint="Stored only in this app's protected user data"
        placeholder="Add a note for your next visit"
        placeholderTextColor={p.muted}
        value={journal.draft}
        onChangeText={journal.setDraft}
        editable={service !== null && !journal.busy}
        multiline
        maxLength={5_000}
        style={{
          color: p.text,
          borderColor: p.border,
          borderWidth: 1,
          borderRadius: 10,
          minHeight: 96,
          padding: 12,
          textAlignVertical: 'top',
        }}
      />
      <ProductButton
        label="Check in"
        hint="Save the current time and this note privately for the selected place"
        disabled={service === null || journal.busy}
        onPress={() => journal.save(true)}
      />
      <ProductButton
        label="Save note"
        hint="Update your private place note without creating a check-in"
        disabled={
          service === null ||
          journal.busy ||
          journal.draft.trim() === (journal.entry?.note.trim() ?? '')
        }
        onPress={() => journal.save(false)}
      />
      <Text accessibilityLiveRegion="polite">
        {service === null
          ? 'Private storage is not ready; map details remain available.'
          : journal.status ||
            `${journal.entry?.checkIns.length ?? 0} private check-ins saved on this device.`}
      </Text>
      {(journal.entry?.checkIns ?? []).slice(0, 5).map((checkIn) => (
        <Text key={checkIn.id}>Checked in {new Date(checkIn.occurredAt).toLocaleString()}</Text>
      ))}
      {(journal.entry?.checkIns.length ?? 0) > 5 ? (
        <Text>Showing your 5 newest check-ins.</Text>
      ) : null}
    </View>
  );
}
