import type { HostNode } from './host-tree';

// Components React Native and its common companions put between an app's own
// component and the host element. Skipped when naming the component to fix.
const FRAMEWORK_COMPONENTS = new Set([
  'ActivityIndicator',
  'AnimatedComponent',
  'AnimatedScrollViewWithOrWithoutInvertedRefreshControl',
  'CellRenderer',
  'FlatList',
  'Image',
  'ImageBackground',
  'InternalTextInput',
  'ItemWithSeparator',
  'KeyboardAvoidingView',
  'Pressable',
  'SafeAreaView',
  'ScrollView',
  'ScrollViewStickyHeader',
  'SectionList',
  'Switch',
  'Text',
  'TextInput',
  'TouchableHighlight',
  'TouchableNativeFeedback',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
  'View',
  'VirtualizedList',
  'VirtualizedListCellContextProvider',
  'VirtualizedListContextProvider',
  'VirtualizedListContextResetter',
  'VirtualizedSectionList',
]);

// Wrappers React names after what they wrap, and the components of
// react-native-screens, community modules and react-native-gesture-handler.
const FRAMEWORK_COMPONENT_PATTERN = /^(Animated|Memo|ForwardRef)\(|^RN[SC][A-Z]|^RNGestureHandler/;

const isFrameworkComponent = (name: string) =>
  FRAMEWORK_COMPONENTS.has(name) || FRAMEWORK_COMPONENT_PATTERN.test(name);

// The component that rendered the element is the one to edit. Without owner
// information, fall back to the nearest one above it in the tree.
export const getComponent = (node: HostNode): string | null =>
  node.ownerPath.find((name) => !isFrameworkComponent(name)) ??
  [...node.componentPath].reverse().find((name) => !isFrameworkComponent(name)) ??
  null;
