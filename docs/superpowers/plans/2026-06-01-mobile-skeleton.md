# PoisonedFinance — Mobile Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Expo/React Native app with file-based routing, a 5-tab bottom navigator, all 6 screen stubs navigable, and a centralised design token system matching the HTML mockup.

**Architecture:** Single Expo app in `mobile/` using Expo Router v3 file-based routing. Five main screens live under `app/(tabs)/`; Review Queue and Category Edit are full-screen modals in the root stack (`app/review.tsx`, `app/category-edit.tsx`). All styling uses React Native `StyleSheet` with tokens from `constants/theme.ts` — no third-party UI library.

**Tech Stack:** Expo SDK 51, Expo Router 3.5, React Native 0.74, TypeScript 5.3, `react-native-safe-area-context`, `@expo/vector-icons` (Ionicons), `jest-expo`, `@testing-library/react-native`

---

## File Structure

```
mobile/
├── package.json                          # deps + jest config + test script
├── app.json                              # Expo config (dark mode, scheme, router plugin)
├── tsconfig.json                         # strict + @/ path alias
├── babel.config.js                       # babel-preset-expo
├── constants/
│   └── theme.ts                          # All design tokens (colors, spacing, radius)
├── components/
│   └── ScreenShell.tsx                   # SafeAreaView + optional ScrollView wrapper
└── app/
    ├── _layout.tsx                       # Root Stack: (tabs) + 2 modal routes
    ├── (tabs)/
    │   ├── _layout.tsx                   # Bottom Tabs (5 tabs, Ionicons icons)
    │   ├── index.tsx                     # Dashboard stub
    │   ├── spending.tsx                  # Spending stub
    │   ├── forecast.tsx                  # Forecast stub
    │   ├── transactions.tsx              # Transactions stub
    │   └── settings.tsx                  # Settings stub
    ├── review.tsx                        # Review Queue modal stub
    └── category-edit.tsx                 # Category Edit modal stub
```

Tests mirror the source tree under `mobile/__tests__/`.

---

### Task 1: Expo project config files

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/app.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/babel.config.js`

- [ ] **Step 1: Create `mobile/package.json`**

```json
{
  "name": "poisonedfinance-mobile",
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "test": "jest --watchAll=false"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.0",
    "@expo/vector-icons": "^14.0.0",
    "react-native-safe-area-context": "4.10.1",
    "react-native-screens": "3.31.1"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@testing-library/react-native": "^12.4.3",
    "@types/react": "~18.2.79",
    "jest": "^29.7.0",
    "jest-expo": "~51.0.0",
    "typescript": "~5.3.3"
  },
  "jest": {
    "preset": "jest-expo",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/$1"
    }
  }
}
```

- [ ] **Step 2: Create `mobile/app.json`**

```json
{
  "expo": {
    "name": "PoisonedFinance",
    "slug": "poisonedfinance",
    "version": "0.1.0",
    "orientation": "portrait",
    "scheme": "poisonedfinance",
    "userInterfaceStyle": "dark",
    "backgroundColor": "#0f0f13",
    "splash": { "backgroundColor": "#0f0f13" },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.poisoneddm.poisonedfinance"
    },
    "android": {
      "package": "com.poisoneddm.poisonedfinance",
      "adaptiveIcon": { "backgroundColor": "#0f0f13" }
    },
    "plugins": ["expo-router"]
  }
}
```

- [ ] **Step 3: Create `mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 4: Create `mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

- [ ] **Step 5: Install dependencies**

Run from the repo root:
```bash
cd mobile && npm install
```

Expected: `mobile/node_modules/` created, no unresolved peer dependency errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/app.json mobile/tsconfig.json mobile/babel.config.js
git commit -m "feat(mobile): initialise Expo project scaffold"
```

---

### Task 2: Design tokens

**Files:**
- Create: `mobile/constants/theme.ts`
- Create: `mobile/__tests__/constants/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/constants/theme.test.ts`:

```typescript
import { colors, spacing, radius } from '@/constants/theme';

const requiredColors = [
  'bg', 'surface', 'card', 'border',
  'text', 'textMuted', 'textDim',
  'purple', 'purpleLight', 'purpleDim',
  'needs', 'wants', 'savings',
  'green', 'amber', 'red',
  'pillGreenBg', 'pillAmberBg', 'pillRedBg',
] as const;

describe('colors', () => {
  it.each(requiredColors)('has %s defined as a hex string', (key) => {
    expect(colors[key]).toMatch(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
  });
});

describe('spacing', () => {
  it('is monotonically increasing xs → xl', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.lg).toBeLessThan(spacing.xl);
  });
});

describe('radius', () => {
  it('has sm < md < lg and round > 100', () => {
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
    expect(radius.round).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mobile && npm test -- __tests__/constants/theme.test.ts
```

Expected: FAIL — `Cannot find module '@/constants/theme'`

- [ ] **Step 3: Create `mobile/constants/theme.ts`**

```typescript
export const colors = {
  // Backgrounds
  bg: '#0f0f13',
  surface: '#16161e',
  card: '#1e1e2e',
  border: '#2a2a3a',

  // Text
  text: '#e8e8f0',
  textMuted: '#888888',
  textDim: '#666666',

  // Brand
  purple: '#6c63ff',
  purpleLight: '#a5b4fc',
  purpleDim: '#2d2b4e',

  // Meta-bucket accent colours
  needs: '#60a5fa',
  wants: '#f472b6',
  savings: '#4ade80',

  // Status
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#f87171',

  // Dashboard pill status backgrounds (dim)
  pillGreenBg: '#0d2e1a',
  pillAmberBg: '#2d2208',
  pillRedBg: '#2d0a0a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  round: 999,
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mobile && npm test -- __tests__/constants/theme.test.ts
```

Expected: PASS — 19 color tests + 2 structural tests = 21 passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/constants/theme.ts mobile/__tests__/constants/theme.test.ts
git commit -m "feat(mobile): add design token system (colors, spacing, radius)"
```

---

### Task 3: ScreenShell component

**Files:**
- Create: `mobile/components/ScreenShell.tsx`
- Create: `mobile/__tests__/components/ScreenShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/ScreenShell.test.tsx`:

```typescript
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import ScreenShell from '@/components/ScreenShell';

describe('ScreenShell', () => {
  it('renders children inside a scroll view by default', () => {
    render(
      <ScreenShell>
        <Text>hello world</Text>
      </ScreenShell>
    );
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('renders children without scroll when scroll={false}', () => {
    render(
      <ScreenShell scroll={false}>
        <Text>no scroll</Text>
      </ScreenShell>
    );
    expect(screen.getByText('no scroll')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mobile && npm test -- __tests__/components/ScreenShell.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ScreenShell'`

- [ ] **Step 3: Create `mobile/components/ScreenShell.tsx`**

```typescript
import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
}

export default function ScreenShell({ children, scroll = true }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  fill: { flex: 1 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mobile && npm test -- __tests__/components/ScreenShell.test.tsx
```

Expected: PASS — 2/2

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ScreenShell.tsx mobile/__tests__/components/ScreenShell.test.tsx
git commit -m "feat(mobile): add ScreenShell layout component"
```

---

### Task 4: Root stack layout

**Files:**
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/__tests__/app/layout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/app/layout.test.tsx`:

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

jest.mock('expo-router', () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  'Stack.Screen': () => null,
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

it('renders without crashing', () => {
  expect(() => render(<RootLayout />)).not.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mobile && npm test -- __tests__/app/layout.test.tsx
```

Expected: FAIL — `Cannot find module '@/app/_layout'`

- [ ] **Step 3: Create `mobile/app/_layout.tsx`**

```typescript
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="review"
          options={{
            presentation: 'fullScreenModal',
            headerShown: true,
            title: 'Review',
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen
          name="category-edit"
          options={{
            presentation: 'fullScreenModal',
            headerShown: true,
            title: 'Change Category',
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
      </Stack>
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mobile && npm test -- __tests__/app/layout.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/app/_layout.tsx mobile/__tests__/app/layout.test.tsx
git commit -m "feat(mobile): add root stack layout with Review and Category Edit modal routes"
```

---

### Task 5: Tab navigator

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/__tests__/app/tabs/layout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/app/tabs/layout.test.tsx`:

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import TabLayout from '@/app/(tabs)/_layout';

jest.mock('expo-router', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  'Tabs.Screen': () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

it('renders without crashing', () => {
  expect(() => render(<TabLayout />)).not.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd mobile && npm test -- "__tests__/app/tabs/layout.test.tsx"
```

Expected: FAIL — `Cannot find module '@/app/(tabs)/_layout'`

- [ ] **Step 3: Create `mobile/app/(tabs)/_layout.tsx`**

```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IoniconsName; color: string }) {
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="spending"
        options={{
          title: 'Spending',
          tabBarIcon: ({ color }) => <TabIcon name="bar-chart-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="forecast"
        options={{
          title: 'Forecast',
          tabBarIcon: ({ color }) => <TabIcon name="trending-up-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color }) => <TabIcon name="list-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd mobile && npm test -- "__tests__/app/tabs/layout.test.tsx"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/_layout.tsx" "mobile/__tests__/app/tabs/layout.test.tsx"
git commit -m "feat(mobile): add bottom tab navigator (Home, Spending, Forecast, Transactions, Settings)"
```

---

### Task 6: Tab screen stubs

**Files:**
- Create: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/(tabs)/spending.tsx`
- Create: `mobile/app/(tabs)/forecast.tsx`
- Create: `mobile/app/(tabs)/transactions.tsx`
- Create: `mobile/app/(tabs)/settings.tsx`
- Create: `mobile/__tests__/app/tabs/screens.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/app/tabs/screens.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import DashboardScreen from '@/app/(tabs)/index';
import SpendingScreen from '@/app/(tabs)/spending';
import ForecastScreen from '@/app/(tabs)/forecast';
import TransactionsScreen from '@/app/(tabs)/transactions';
import SettingsScreen from '@/app/(tabs)/settings';

it('Dashboard renders greeting heading', () => {
  render(<DashboardScreen />);
  expect(screen.getByText('Good morning, Ryan')).toBeTruthy();
});

it('Spending renders screen heading', () => {
  render(<SpendingScreen />);
  expect(screen.getByText('Spending')).toBeTruthy();
});

it('Forecast renders screen heading', () => {
  render(<ForecastScreen />);
  expect(screen.getByText('Savings Forecast')).toBeTruthy();
});

it('Transactions renders screen heading', () => {
  render(<TransactionsScreen />);
  expect(screen.getByText('Transactions')).toBeTruthy();
});

it('Settings renders screen heading', () => {
  render(<SettingsScreen />);
  expect(screen.getByText('Settings')).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && npm test -- "__tests__/app/tabs/screens.test.tsx"
```

Expected: FAIL — 5 × `Cannot find module`

- [ ] **Step 3: Create `mobile/app/(tabs)/index.tsx`**

```typescript
import { View, Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function DashboardScreen() {
  return (
    <ScreenShell>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Good morning, Ryan</Text>
          <Text style={styles.sub}>May 2026</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>R</Text>
        </View>
      </View>
      <Text style={styles.placeholder}>Dashboard — coming in Phase 3</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, fontSize: 14 },
});
```

- [ ] **Step 4: Create `mobile/app/(tabs)/spending.tsx`**

```typescript
import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function SpendingScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Spending</Text>
      <Text style={styles.placeholder}>Spending breakdown — coming in Phase 3</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});
```

- [ ] **Step 5: Create `mobile/app/(tabs)/forecast.tsx`**

```typescript
import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function ForecastScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Savings Forecast</Text>
      <Text style={styles.placeholder}>Forecast tiers — coming in Phase 4</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});
```

- [ ] **Step 6: Create `mobile/app/(tabs)/transactions.tsx`**

```typescript
import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function TransactionsScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Transactions</Text>
      <Text style={styles.placeholder}>Transaction list — coming in Phase 3</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});
```

- [ ] **Step 7: Create `mobile/app/(tabs)/settings.tsx`**

```typescript
import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.placeholder}>Account settings — coming later</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});
```

- [ ] **Step 8: Run the tests to verify they all pass**

```bash
cd mobile && npm test -- "__tests__/app/tabs/screens.test.tsx"
```

Expected: PASS — 5/5

- [ ] **Step 9: Commit**

```bash
git add "mobile/app/(tabs)/index.tsx" "mobile/app/(tabs)/spending.tsx" "mobile/app/(tabs)/forecast.tsx" "mobile/app/(tabs)/transactions.tsx" "mobile/app/(tabs)/settings.tsx" "mobile/__tests__/app/tabs/screens.test.tsx"
git commit -m "feat(mobile): add 5 tab screen stubs (Dashboard, Spending, Forecast, Transactions, Settings)"
```

---

### Task 7: Modal screen stubs

**Files:**
- Create: `mobile/app/review.tsx`
- Create: `mobile/app/category-edit.tsx`
- Create: `mobile/__tests__/app/modals.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/app/modals.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ReviewScreen from '@/app/review';
import CategoryEditScreen from '@/app/category-edit';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

it('Review Queue renders screen heading', () => {
  render(<ReviewScreen />);
  expect(screen.getByText('Review Queue')).toBeTruthy();
});

it('Category Edit renders screen heading', () => {
  render(<CategoryEditScreen />);
  expect(screen.getByText('Change Category')).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && npm test -- __tests__/app/modals.test.tsx
```

Expected: FAIL — 2 × `Cannot find module`

- [ ] **Step 3: Create `mobile/app/review.tsx`**

```typescript
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing, radius } from '@/constants/theme';

export default function ReviewScreen() {
  const router = useRouter();
  return (
    <ScreenShell>
      <Text style={styles.title}>Review Queue</Text>
      <Text style={styles.placeholder}>Categorisation review — coming in Phase 4</Text>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
  closeBtn: {
    margin: spacing.xl,
    marginTop: spacing.xxl,
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
  },
  closeBtnText: { color: colors.purpleLight, fontWeight: '600', fontSize: 15 },
});
```

- [ ] **Step 4: Create `mobile/app/category-edit.tsx`**

```typescript
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing, radius } from '@/constants/theme';

export default function CategoryEditScreen() {
  const router = useRouter();
  return (
    <ScreenShell>
      <Text style={styles.title}>Change Category</Text>
      <Text style={styles.placeholder}>Category picker — coming in Phase 4</Text>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
  closeBtn: {
    margin: spacing.xl,
    marginTop: spacing.xxl,
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
  },
  closeBtnText: { color: colors.purpleLight, fontWeight: '600', fontSize: 15 },
});
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd mobile && npm test -- __tests__/app/modals.test.tsx
```

Expected: PASS — 2/2

- [ ] **Step 6: Commit**

```bash
git add mobile/app/review.tsx mobile/app/category-edit.tsx mobile/__tests__/app/modals.test.tsx
git commit -m "feat(mobile): add Review Queue and Category Edit modal screen stubs"
```

---

### Task 8: Full suite + push

- [ ] **Step 1: Run the full test suite**

```bash
cd mobile && npm test
```

Expected output:
```
 PASS  __tests__/constants/theme.test.ts
 PASS  __tests__/components/ScreenShell.test.tsx
 PASS  __tests__/app/layout.test.tsx
 PASS  __tests__/app/tabs/layout.test.tsx
 PASS  __tests__/app/tabs/screens.test.tsx
 PASS  __tests__/app/modals.test.tsx

Test Suites: 6 passed, 6 total
Tests:       ~26 passed, 0 failed
```

If any tests fail, fix before proceeding.

- [ ] **Step 2: Push branch**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] Expo app skeleton → Tasks 1–2
- [x] Bottom tab navigation (5 tabs: Home, Spending, Forecast, Transactions, Settings) → Task 5
- [x] All 6 screens navigable (5 tabs + 2 modals) → Tasks 6–7
- [x] Design tokens matching HTML mockup colours, spacing, radius → Task 2
- [x] Dark theme (`bg: #0f0f13`) applied via `ScreenShell` and `app.json` `userInterfaceStyle: dark` → Tasks 2–3

### Placeholder scan
No TBD, TODO, or "implement later" text present. Every step contains complete file content or an exact shell command.

### Type consistency
- `ScreenShell` props `{ children: React.ReactNode; scroll?: boolean }` — defined Task 3, consumed identically in Tasks 6 and 7.
- `colors`, `spacing`, `radius` imported from `@/constants/theme` — same import path in every consumer.
- `IoniconsName = React.ComponentProps<typeof Ionicons>['name']` — defined and used only in `(tabs)/_layout.tsx` (Task 5).
- `useRouter` mock `{ back: jest.fn() }` — matches the only method called in `review.tsx` and `category-edit.tsx`.
