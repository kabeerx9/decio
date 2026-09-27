import { useUser } from '@clerk/expo';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;

export async function uploadProfilePhoto(user: ClerkUser): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled) return false;
  const asset = picked.assets[0];
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if (asset.width > 800 || asset.height > 800) {
    context.resize(asset.width >= asset.height ? { width: 800, height: null } : { width: null, height: 800 });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 });
  const file: Blob = Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : new File(saved.uri);
  if (file.size > 4 * 1024 * 1024) throw new Error('Choose a smaller photo.');
  await user.setProfileImage({ file });
  await user.reload();
  return true;
}
