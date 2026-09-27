import { ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export function Screen({ children, edges = ['top'], style }: { children: ReactNode; edges?: Edge[]; style?: ViewStyle }) {
  return <SafeAreaView style={[styles.root, style]} edges={edges}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
