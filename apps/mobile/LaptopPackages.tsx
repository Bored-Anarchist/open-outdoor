import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ProductText as Text, useAnnouncement } from './accessibility';
import { ProductButton, usePalette } from './ProductComponents';
import type { useStatePackages } from './useStatePackages';

export function LaptopPackages({
  service,
}: {
  readonly service: ReturnType<typeof useStatePackages>;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  // Announce outcomes, while the transfer's changing byte counter remains readable on demand.
  useAnnouncement(service.laptopBusy ? '' : service.laptopStatus);
  const inputStyle = {
    color: palette.text,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: palette.surface,
    minHeight: 56,
    padding: 12,
  };
  return (
    <View style={{ gap: 10, marginVertical: 12 }}>
      <ProductButton
        label={open ? 'Close laptop connection' : 'Connect to laptop'}
        hint="Browse and download public state packages from a laptop on the same Wi-Fi"
        disabled={service.busy}
        onPress={() => {
          if (open && service.laptopAvailable) {
            void service.disconnectLaptop();
            setCode('');
          }
          setOpen(!open);
        }}
      />
      {open && (
        <>
          <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
            Connect to laptop
          </Text>
          <Text>
            Keep both devices on the same trusted Wi-Fi. Start Open Outdoor’s package server on your
            laptop, then enter the address and pairing code shown there. Downloaded states stay on
            this phone and work offline.
          </Text>
          {!service.laptopAvailable ? (
            <Text>Install an app build with laptop connections to enable this feature.</Text>
          ) : (
            <>
              {!service.laptopCatalog && (
                <>
                  <Text>Laptop address</Text>
                  <TextInput
                    accessibilityLabel="Laptop address"
                    accessibilityHint="Enter the local address shown by the laptop package server"
                    placeholder="http://192.168.1.20:8765"
                    placeholderTextColor={palette.muted}
                    value={address}
                    onChangeText={setAddress}
                    editable={!service.busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={inputStyle}
                  />
                  <Text>Pairing code</Text>
                  <TextInput
                    accessibilityLabel="Laptop pairing code"
                    accessibilityHint="Paste the pairing code shown in the laptop terminal"
                    placeholder="Paste pairing code"
                    placeholderTextColor={palette.muted}
                    value={code}
                    onChangeText={setCode}
                    editable={!service.busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    style={inputStyle}
                  />
                  <ProductButton
                    label="Browse laptop packages"
                    hint="Connect and list supported public state packages"
                    disabled={!service.ready || service.busy || !address.trim() || !code.trim()}
                    busy={service.laptopBusy}
                    onPress={() => {
                      void service.connectLaptop(address, code).then((connected) => {
                        if (connected) setCode('');
                      });
                    }}
                  />
                </>
              )}
              <Text accessibilityLiveRegion={service.laptopBusy ? 'none' : 'polite'}>
                {service.laptopStatus}
              </Text>
              {service.laptopBusy && (
                <ProductButton
                  label="Cancel transfer"
                  hint="Stop this transfer and keep existing installed states"
                  disabled={service.laptopProgress?.phase === 'verifying'}
                  onPress={() => {
                    void service.cancelLaptop();
                  }}
                />
              )}
              {service.laptopCatalog && (
                <>
                  <Text>Connected to {address.trim()}</Text>
                  <ProductButton
                    label="Disconnect laptop"
                    hint="Forget the connection and pairing code; keep installed states"
                    disabled={service.busy}
                    onPress={() => {
                      void service.disconnectLaptop();
                      setCode('');
                    }}
                  />
                  {service.laptopCatalog.packages.map((entry) => {
                    const installed = service.packages.some(
                      (current) => current.sha256 === entry.sha256 && !current.integrityError,
                    );
                    return (
                      <View key={entry.state} style={{ gap: 6, marginVertical: 6 }}>
                        <Text style={{ fontWeight: '700' }}>{entry.name}</Text>
                        <Text>
                          {(entry.bytes / 1048576).toFixed(1)} MiB download ·{' '}
                          {(entry.installedBytes / 1048576).toFixed(1)} MiB installed
                        </Text>
                        <ProductButton
                          label={installed ? `${entry.name} installed` : `Download ${entry.name}`}
                          hint="Download, verify and install this state for offline use"
                          disabled={service.busy || installed}
                          onPress={() => {
                            void service.installFromLaptop(entry.state);
                          }}
                        />
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
