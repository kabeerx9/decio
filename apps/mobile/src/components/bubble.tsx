import { StyleSheet, Text, View } from 'react-native';

import { isEmojiOnly } from '@/lib/format';
import { colors, fonts } from '@/theme';

type Props = { body: string; mine: boolean; accentColor: string; time?: string };

export function Bubble({ body, mine, accentColor, time }: Props) {
  return <View style={[styles.wrap, mine ? styles.mine : styles.theirs]}>
    {isEmojiOnly(body) ? <Text style={styles.emoji}>{body}</Text> :
      <View style={[styles.bubble, { backgroundColor: mine ? accentColor : colors.surface2 }]}>
        <Text style={[styles.text, { color: mine ? colors.onAccent : colors.ink }]}>{body}</Text>
      </View>}
    {!!time && <Text style={styles.time}>{time}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '80%', marginVertical: 2 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  text: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  emoji: { fontSize: 44, lineHeight: 54 },
  time: { fontFamily: fonts.body, fontSize: 11, color: colors.mute, marginTop: 4, marginHorizontal: 6, marginBottom: 6 },
});
