import { Alert } from 'react-native';

// User-initiated sign-out asks first; automatic sign-out on an expired session stays silent.
export function confirmSignOut(signOut: () => void) {
  Alert.alert('Sign out?', "You'll need a new email code to get back in.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: signOut },
  ]);
}
