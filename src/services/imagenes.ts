/**
 * Subida de imágenes a Cloudinary (plan gratis, upload preset sin firma).
 * Solo se usa para fotos; la URL resultante se guarda en Firestore.
 */
import type { PickedImage } from '@/lib/image-picker';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

export const isCloudinaryConfigured = CLOUD_NAME.length > 0 && UPLOAD_PRESET.length > 0;

type CloudinaryResponse = { secure_url?: string; error?: { message?: string } };

/**
 * Sube la imagen (en base64) con el preset sin firma y devuelve la URL https.
 * Se envía como data URI para que funcione igual en Android, iOS y web.
 */
export async function subirImagenProducto(image: PickedImage, productoId: string): Promise<string> {
  if (!isCloudinaryConfigured) {
    throw new Error('Falta configurar Cloudinary (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME y EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET)');
  }
  const body = new FormData();
  body.append('file', `data:${image.mimeType};base64,${image.base64}`);
  body.append('upload_preset', UPLOAD_PRESET);
  // Nombre estable por producto + marca de tiempo (el preset define la carpeta)
  body.append('public_id', `${productoId}-${Date.now()}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as CloudinaryResponse;
  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message ? `Cloudinary: ${json.error.message}` : 'No se pudo subir la imagen');
  }
  return json.secure_url;
}

/**
 * Devuelve una URL de Cloudinary con transformación (recorte cuadrado, tamaño y
 * compresión automática). Si la URL no es de Cloudinary, la devuelve tal cual.
 */
export function miniatura(url: string | null | undefined, size = 400): string | null {
  if (!url) return null;
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (!url.includes('res.cloudinary.com') || i < 0) return url;
  return `${url.slice(0, i + marker.length)}c_fill,w_${size},h_${size},q_auto,f_auto/${url.slice(i + marker.length)}`;
}
