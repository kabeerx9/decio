import * as Haptics from 'expo-haptics';

// Haptics are a nicety: devices without a vibrator (and emulators) reject, and that must never surface.
export function tick() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function success() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
