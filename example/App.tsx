import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import {
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RozeniteAccessibility } from 'rozenite-a11y';

const LOGO = { uri: 'https://reactnative.dev/img/tiny_logo.png' };
const noop = () => undefined;

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text role="heading" style={styles.heading}>
      {title}
    </Text>
    {children}
  </View>
);

// Each section pairs a correct element with a broken one, so the Accessibility
// panel has both a clean result and an issue to report for every rule.
export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(4);
  const [saved, setSaved] = useState(0);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text role="heading" style={styles.title}>
          rozenite-a11y example
        </Text>
        <Text style={styles.subtitle}>Run an audit from the Accessibility panel in DevTools.</Text>

        <Section title="Labels and roles">
          <Pressable role="button" style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>Labelled button</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>Button without a role</Text>
          </Pressable>
          <Pressable role="button" style={styles.button} onPress={noop}>
            <Image source={LOGO} style={styles.icon} />
          </Pressable>
        </Section>

        <Section title="Touch targets">
          <Pressable
            role="button"
            accessibilityLabel="Small target"
            style={styles.small}
            onPress={noop}
          />
          <Pressable
            role="button"
            accessibilityLabel="Small target with hit slop"
            hitSlop={16}
            style={styles.small}
            onPress={noop}
          />
        </Section>

        <Section title="Inputs">
          <TextInput accessibilityLabel="Email" placeholder="Email" style={styles.input} />
          <TextInput placeholder="Placeholder only" style={styles.input} />
        </Section>

        <Section title="Nesting">
          <Pressable role="button" style={styles.row} onPress={noop}>
            <Text>Notifications</Text>
            <Switch value={enabled} onValueChange={setEnabled} />
          </Pressable>
          <View style={styles.row}>
            <Text>Notifications</Text>
            <Switch accessibilityLabel="Notifications" value={enabled} onValueChange={setEnabled} />
          </View>
        </Section>

        <Section title="Roles, state and values">
          <Pressable
            role="checkbox"
            aria-checked={enabled}
            style={styles.button}
            onPress={() => setEnabled(!enabled)}
          >
            <Text style={styles.buttonText}>Checkbox with state</Text>
          </Pressable>
          <Pressable role="checkbox" style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>Checkbox without state</Text>
          </Pressable>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Volume"
            accessibilityValue={{ min: 0, max: 10, now: volume }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) =>
              setVolume((value) => value + (nativeEvent.actionName === 'increment' ? 1 : -1))
            }
            style={styles.track}
          />
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Brightness"
            style={styles.track}
          />
          {/* "heading" belongs to `role`. iOS ignores it here; Android throws, so it is iOS only. */}
          {Platform.OS === 'ios' && (
            <Text accessibilityRole={'heading' as never}>
              ARIA role passed as accessibilityRole
            </Text>
          )}
          <Text role={'headline' as never}>Unknown value of role</Text>
          <Text allowFontScaling={false}>Text that ignores the system font size</Text>
          <Text maxFontSizeMultiplier={1.5}>Text that scales up to 1.5×</Text>
        </Section>

        <Section title="Actions and disabled state">
          <Pressable
            role="button"
            accessibilityActions={[{ name: 'activate' }, { name: 'delete', label: 'Delete' }]}
            onAccessibilityAction={noop}
            style={styles.button}
            onPress={noop}
          >
            <Text style={styles.buttonText}>Message with actions</Text>
          </Pressable>
          <Pressable
            role="button"
            accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
            style={styles.button}
            onPress={noop}
          >
            <Text style={styles.buttonText}>Actions without a handler</Text>
          </Pressable>
          <Pressable
            role="button"
            onAccessibilityAction={noop}
            style={styles.button}
            onPress={noop}
          >
            <Text style={styles.buttonText}>Handler without actions</Text>
          </Pressable>
          <Pressable role="button" disabled style={[styles.button, styles.disabled]} onPress={noop}>
            <Text style={styles.buttonText}>Disabled button</Text>
          </Pressable>
          <Pressable
            role="button"
            pointerEvents="none"
            style={[styles.button, styles.disabled]}
            onPress={noop}
          >
            <Text style={styles.buttonText}>Looks disabled, is not marked</Text>
          </Pressable>
          <View pointerEvents="none">
            <Pressable role="button" style={[styles.button, styles.disabled]} onPress={noop}>
              <Text style={styles.buttonText}>Blocked by its parent, is not marked</Text>
            </Pressable>
          </View>
          <Pressable role="button" pointerEvents="box-none" style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>box-none, still pressable</Text>
          </Pressable>
          <Pressable role="button" style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>Control reachable by screen readers</Text>
          </Pressable>
          <Pressable accessible={false} style={styles.button} onPress={noop}>
            <Text style={styles.buttonText}>Control that is hidden from screen readers</Text>
          </Pressable>
        </Section>

        <Section title="Live regions and hiding">
          <Pressable role="button" style={styles.button} onPress={() => setSaved(saved + 1)}>
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
          {/* TalkBack only. Text ignores aria-live, so it needs accessibilityLiveRegion. */}
          <Text accessibilityLiveRegion="polite">
            {saved > 0 ? `Saved ${saved} times` : 'Not saved yet'}
          </Text>
          <Text>{saved > 0 ? `Saved ${saved} times` : 'Not saved yet'} (no live region)</Text>
          <View aria-hidden>
            <Text>Hidden on both platforms</Text>
          </View>
          <View accessibilityElementsHidden>
            <Text>Hidden on iOS only (accessibilityElementsHidden)</Text>
          </View>
          <View importantForAccessibility="no-hide-descendants">
            <Text>Hidden on Android only (importantForAccessibility)</Text>
          </View>
        </Section>

        <Section title="Images">
          <View style={styles.images}>
            <Image source={LOGO} alt="React Native logo" style={styles.icon} />
            <Image source={LOGO} style={styles.icon} />
          </View>
        </Section>
      </ScrollView>
      <StatusBar style="auto" />
      <RozeniteAccessibility />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#555' },
  section: { borderWidth: 1, borderColor: '#ddd', padding: 16, gap: 8 },
  heading: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#8232ff',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  small: { width: 24, height: 24, backgroundColor: '#8232ff' },
  input: { height: 48, borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 12 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 12,
  },
  track: { height: 48, backgroundColor: '#eee' },
  images: { flexDirection: 'row', gap: 12 },
  icon: { width: 32, height: 32 },
});
