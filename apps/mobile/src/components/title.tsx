import { StyleSheet, Text, TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = { children: string; size?: number; dot?: string; color?: string; numberOfLines?: number; style?: TextStyle };

export function Title({ children, size = 44, dot, color = colors.ink, numberOfLines, style }: Props) {
  return <Text accessibilityRole="header" numberOfLines={numberOfLines} adjustsFontSizeToFit={numberOfLines === 1} minimumFontScale={0.6}
    style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.02), color }, style]}>
    {children.toUpperCase()}{dot ? <Text style={{ color: dot }}>.</Text> : null}
  </Text>;
}

const styles = StyleSheet.create({ title: { fontFamily: fonts.display, includeFontPadding: false, letterSpacing: 0.2 } });
