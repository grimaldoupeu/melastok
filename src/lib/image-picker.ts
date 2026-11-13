import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  uri: string;
  base64: string;
  mimeType: string;
};

/** Abre la galería o la cámara y devuelve la imagen en base64 (o null si se canceló) */
export async function pickProductImage(source: 'galeria' | 'camara'): Promise<PickedImage | null> {
  if (source === 'camara') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Necesitamos permiso de cámara para tomar la foto');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Necesitamos permiso para acceder a tus fotos');
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  };
  const result =
    source === 'camara'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No se pudo leer la imagen seleccionada');
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}
