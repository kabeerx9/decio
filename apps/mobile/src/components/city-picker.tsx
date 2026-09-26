import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

const suggestedCities = [
  'Ahmedabad', 'Bengaluru', 'Chandigarh', 'Chennai', 'Delhi', 'Hyderabad',
  'Jaipur', 'Kolkata', 'Mumbai', 'Pune', 'London', 'New York', 'San Francisco',
];

export function CityPicker({ value, onChange }: { value: string; onChange: (city: string) => void }) {
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
      <Ionicons name="location-outline" size={19} color={colors.blue} />
      <Text style={[styles.triggerText, !value && styles.placeholder]}>{value || 'Choose your city'}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.muted} />
    </Pressable>
    <BottomSheetModal ref={sheet} snapPoints={['75%']} enablePanDownToClose onDismiss={() => setSearch('')}>
      <BottomSheetView style={styles.sheet}>
        <View style={styles.sheetHeader}><View><Text style={styles.kicker}>CITY / CURRENT</Text><Text style={styles.sheetTitle}>Where are you based?</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close city picker" onPress={() => sheet.current?.dismiss()} style={styles.close}><Ionicons name="close" size={20} color={colors.ink} /></Pressable></View>
        <Text style={styles.sheetHint}>Choose a city or type your own. You can change this later.</Text>
        <View style={styles.searchBox}><Ionicons name="search" size={19} color={colors.muted} /><BottomSheetTextInput accessibilityLabel="Search cities" autoCapitalize="words" placeholder="Search cities" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={styles.searchInput} /></View>
        <BottomSheetScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.results}>
          {matches.map((city) => <Pressable key={city} accessibilityRole="button" onPress={() => choose(city)} style={styles.cityRow}><Text style={styles.cityText}>{city}</Text>{value === city && <Ionicons name="checkmark-circle" size={20} color={colors.blue} />}</Pressable>)}
          {customCity && <Pressable accessibilityRole="button" onPress={() => choose(query)} style={styles.cityRow}><Ionicons name="add-circle-outline" size={20} color={colors.blue} /><Text style={styles.cityText}>Use “{query}”</Text></Pressable>}
          {matches.length === 0 && !customCity && <Text style={styles.noResults}>Type at least two characters to use a city.</Text>}
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
  triggerText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 15 }, placeholder: { color: colors.muted },
  sheet: { flex: 1, paddingHorizontal: 24, paddingTop: 24, backgroundColor: colors.paper }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: colors.blue, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 1.5 }, sheetTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 26, marginTop: 5 },
  close: { width: 42, height: 42, backgroundColor: colors.white, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sheetHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 9 }, searchBox: { height: 52, marginTop: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 15 },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 15 }, results: { paddingTop: 14, paddingBottom: 45 },
  cityRow: { minHeight: 53, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10 }, cityText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 15 }, noResults: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 20 },
});
