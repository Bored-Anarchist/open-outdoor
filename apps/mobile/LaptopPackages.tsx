import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ProductText as Text, useAnnouncement } from './accessibility';
import { ProductButton, usePalette } from './ProductComponents';
import type { useStatePackages } from './useStatePackages';
import { useLaptopPairing } from './useLaptopPairing';

export function LaptopPackages({
  service,
  embedded = false,
}: {
  readonly service: ReturnType<typeof useStatePackages>;
  readonly embedded?: boolean;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(embedded);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const pairing = useLaptopPairing(
    open && service.laptopAvailable && !service.laptopCatalog,
    service.connectLaptop,
    (value) => {
      setAddress(value);
      setCode('');
    },
  );
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
      {!embedded && (
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
      )}
      {open && (
        <>
          {service.laptopProgress && (
            <View
              accessible
              accessibilityLabel={`Transfer phase ${service.laptopProgress.phase}`}
              style={{ backgroundColor: palette.selected, borderRadius: 14, padding: 16 }}
            >
              <Text style={{ fontWeight: '700' }}>{service.laptopProgress.phase}</Text>
              <Text>Keep the app open.</Text>
            </View>
          )}
          {service.trustedLaptopSigners.length > 0 && (
            <>
              <ProductButton
                label="Trusted laptops"
                hint="Review or revoke saved update keys, including offline"
                selected={trustOpen}
                onPress={() => setTrustOpen(!trustOpen)}
              />
              {trustOpen && (
                <>
                  <Text>
                    You can stop trusting a laptop even while offline. Installed maps stay
                    available.
                  </Text>
                  {service.trustedLaptopSigners.map((saved) => (
                    <View key={saved} style={{ gap: 6 }}>
                      <Text selectable>{saved}</Text>
                      <ProductButton
                        label={`Remove update trust ${saved.slice(0, 12)}`}
                        hint="Revoke this saved laptop key without a network connection; keep maps and replay protection"
                        disabled={service.busy}
                        onPress={() => {
                          void service.revokeSavedLaptopSigner(saved);
                        }}
                      />
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
            Connect to laptop
          </Text>
          <Text>
            Use the same trusted Wi-Fi. Scan the laptop's pairing code, or enter its address and
            code.
          </Text>
          {!service.laptopAvailable ? (
            <Text>Install an app build with laptop connections to enable this feature.</Text>
          ) : (
            <>
              {!service.laptopCatalog && (
                <>
                  {pairing.available && (
                    <>
                      <Text accessibilityLiveRegion="polite">{pairing.status}</Text>
                      {pairing.laptops.map((laptop) => (
                        <View key={laptop.address} style={{ gap: 6 }}>
                          <Text>
                            {laptop.name} · {laptop.address}
                          </Text>
                          <ProductButton
                            label={`Use ${laptop.name}`}
                            hint="Fill this laptop address, then scan its QR code or enter its pairing code"
                            disabled={service.busy || pairing.scanning}
                            onPress={() => {
                              setAddress(laptop.address);
                              setManualOpen(true);
                            }}
                          />
                        </View>
                      ))}
                      <ProductButton
                        label="Search again"
                        hint="Search nearby laptops on this Wi-Fi for five seconds"
                        disabled={service.busy || pairing.discovering || pairing.scanning}
                        busy={pairing.discovering}
                        onPress={() => {
                          void pairing.discover();
                        }}
                      />
                      <ProductButton
                        label="Scan QR code"
                        hint="Open the camera to scan the code on the laptop pairing page"
                        disabled={!service.ready || service.busy || pairing.scanning}
                        onPress={() => {
                          void pairing.scan();
                        }}
                      />
                      <ProductButton
                        label="Enter address and code"
                        hint="Pair manually using the values on your laptop"
                        selected={manualOpen}
                        onPress={() => setManualOpen(!manualOpen)}
                      />
                    </>
                  )}
                  {(!pairing.available || manualOpen) && (
                    <>
                      <Text>Laptop address</Text>
                      <TextInput
                        accessibilityLabel="Laptop address"
                        accessibilityHint="Enter the local address shown by the laptop package server"
                        placeholder="http://192.168.1.20:8765"
                        placeholderTextColor={palette.muted}
                        value={address}
                        onChangeText={setAddress}
                        editable={!service.busy && !pairing.scanning}
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
                        editable={!service.busy && !pairing.scanning}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        style={inputStyle}
                      />
                      <ProductButton
                        label="Connect"
                        hint="Connect and list supported public state packages"
                        disabled={
                          !service.ready ||
                          service.busy ||
                          pairing.scanning ||
                          !address.trim() ||
                          !code.trim()
                        }
                        busy={service.laptopBusy}
                        onPress={() => {
                          void service
                            .connectLaptop(address, code, fingerprint)
                            .then((connected) => {
                              if (connected) setCode('');
                            });
                        }}
                      />
                      {service.laptopUpdatesAvailable && (
                        <>
                          <Text>Signing fingerprint (optional for manual pairing)</Text>
                          <TextInput
                            accessibilityLabel="Laptop signing fingerprint"
                            accessibilityHint="Copy the full signing fingerprint from the laptop pairing page to enable update trust approval"
                            placeholder="64-character fingerprint"
                            placeholderTextColor={palette.muted}
                            value={fingerprint}
                            onChangeText={setFingerprint}
                            editable={!service.busy && !pairing.scanning}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={inputStyle}
                          />
                        </>
                      )}
                    </>
                  )}
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
                  {service.laptopCatalog.signerFingerprint && (
                    <>
                      <Text>
                        {service.laptopCatalog.signerTrusted
                          ? 'This laptop is trusted for signed state updates.'
                          : 'Newer state packages require your approval of this laptop.'}
                      </Text>
                      <Text selectable>
                        Signing fingerprint: {service.laptopCatalog.signerFingerprint}
                      </Text>
                      {!service.laptopCatalog.signerTrusted &&
                        (service.laptopCatalog.canTrustSigner ? (
                          <>
                            <Text>
                              Approve only the laptop whose pairing page you scanned or compared.
                              Trust stays on this phone until you remove it; installed maps and
                              replay protection are retained.
                            </Text>
                            <ProductButton
                              label="Trust updates"
                              hint="Save this verified laptop signing key and allow compatible public state updates"
                              disabled={service.busy}
                              onPress={() => {
                                void service.approveLaptopUpdates();
                              }}
                            />
                          </>
                        ) : (
                          <Text>
                            To approve updates, disconnect and scan the laptop's QR code or enter
                            the signing fingerprint from its pairing page.
                          </Text>
                        ))}
                      {service.laptopCatalog.signerTrusted && (
                        <ProductButton
                          label="Revoke trust"
                          hint="Block future updates signed by this laptop; keep installed maps and rollback protection"
                          disabled={service.busy}
                          onPress={() => {
                            void service.revokeLaptopUpdates();
                          }}
                        />
                      )}
                      <ProductButton
                        label="Check for updates"
                        hint="Refresh signed packages available from this connected laptop"
                        disabled={service.busy}
                        onPress={() => {
                          void service.refreshLaptopPackages();
                        }}
                      />
                      {!!service.laptopCatalog.blockedCount && (
                        <Text>
                          {service.laptopCatalog.blockedCount} older or conflicting packages were
                          blocked.
                        </Text>
                      )}
                    </>
                  )}
                  <ProductButton
                    label="Disconnect"
                    hint="Forget the connection and pairing code; keep installed states"
                    disabled={service.busy}
                    onPress={() => {
                      void service.disconnectLaptop();
                      setCode('');
                    }}
                  />
                  {service.laptopCatalog.packages.map((entry) => {
                    const current = service.packages.find((item) => item.state === entry.state);
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
                        {current && (
                          <Text>
                            Installed snapshot {current.sha256.slice(0, 12)} · Packaged{' '}
                            {current.generatedAt?.slice(0, 10) || 'date unavailable'}
                          </Text>
                        )}
                        {entry.generatedAt && (
                          <Text>
                            Available snapshot {entry.sha256.slice(0, 12)} · Packaged{' '}
                            {entry.generatedAt.slice(0, 10)}
                            {entry.revision ? ` · Version ${entry.revision}` : ''}
                          </Text>
                        )}
                        {entry.requiresTrust && !installed && (
                          <Text>Trust this laptop before installing this signed update.</Text>
                        )}
                        <ProductButton
                          label={
                            installed
                              ? `${entry.name} installed`
                              : current
                                ? `Update ${entry.name}`
                                : `Download ${entry.name}`
                          }
                          hint="Download, verify and install this state for offline use"
                          disabled={service.busy || installed || entry.requiresTrust === true}
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
