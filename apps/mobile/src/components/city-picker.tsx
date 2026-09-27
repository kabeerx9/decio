import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Title } from '@/components/title';
import { colors, fonts, radius } from '@/theme';

const suggestedCities = [
  'Ahmedabad', 'Bengaluru', 'Chandigarh', 'Chennai', 'Delhi', 'Hyderabad',
  'Jaipur', 'Kolkata', 'Mumbai', 'Pune', 'London', 'New York', 'San Francisco',
];

export function CityPicker({ value, onChange, tint }: { value: string; onChange: (city: string) => void; tint: string }) {
  const sheet = useRef<BottomSheetModal>(null);
  const [search, setSearch] = useState('');
  const query = search.trim();
  const matches = suggestedCities.filter((city) => city.toLowerCase().includes(query.toLowerCase()));
  const customCity = query.length >= 2 && query.length <= 80 && !suggestedCities.some((city) => city.toLowerCase() === query.toLowerCase());

  const choose = (city: string) => {
    onChange(city);
    setSearch('');
    sheet.current?.dismiss();
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Current city, ${value || 'not selected'}. Choose city`} onPress={() => sheet.current?.present()} style={styles.trigger}>
      <Text style={styles.pin}>📍</Text>
      <Text style={[styles.triggerText, !value && styles.placeholder]}>{value || 'choose your city'}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.mute} />
    </Pressable>
    <BottomSheetModal ref={sheet} snapPoints={['75%']} enablePanDownToClose onDismiss={() => setSearch('')} backgroundStyle={{ backgroundColor: colors.surface }}>
      <BottomSheetView style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Title size={34}>your city</Title>
          <Pressable accessibilityRole="button" accessibilityLabel="Close city picker" hitSlop={8} onPress={() => sheet.current?.dismiss()} style={styles.close}>
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.mute} />
          <BottomSheetTextInput accessibilityLabel="Search cities" autoCapitalize="words" placeholder="search or type your own" placeholderTextColor={colors.mute}
            value={search} onChangeText={setSearch} style={styles.searchInput} />
        </View>
        <BottomSheetScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.results}>
          {matches.map((city) => <Pressable key={city} accessibilityRole="button" onPress={() => choose(city)} style={styles.cityRow}>
            <Text style={styles.cityText}>{city}</Text>
            {value === city && <Ionicons name="checkmark-circle" size={22} color={tint} />}
          </Pressable>)}
          {customCity && <Pressable accessibilityRole="button" onPress={() => choose(query)} style={styles.cityRow}>
            <Ionicons name="add-circle" size={22} color={tint} /><Text style={styles.cityText}>use “{query}”</Text>
          </Pressable>}
          {matches.length === 0 && !customCity && <Text style={styles.noResults}>type at least two characters to use a city.</Text>}
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: colors.surface },
  pin: { fontSize: 16 },
  triggerText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  placeholder: { color: colors.mute },
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 20, backgroundColor: colors.surface },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  searchBox: { height: 50, marginTop: 18, borderRadius: 25, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 15 },
  results: { paddingTop: 10, paddingBottom: 45 },
  cityRow: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cityText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 16 },
  noResults: { color: colors.mute, fontFamily: fonts.body, fontSize: 13, marginTop: 20 },
});
