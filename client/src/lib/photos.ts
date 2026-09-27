import { useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import type { PhotoRef } from '@smaran/shared';
import { getBlob } from './api';
import { photoBlobKey, photoCacheKey } from './outbox';

const MAX_SIDE = 1280;

/** Shrinks a camera photo to at most 1280px on its long side as JPEG (~150-300 KB), so it uploads on a weak signal. */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function keepPendingPhoto(clientId: string, blob: Blob) {
  await set(photoBlobKey(clientId), blob);
}

/** An object URL for a photo, from the phone when it's there, from the server otherwise. */
export function usePhotoUrl(photo: PhotoRef | null): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });

  useEffect(() => {
    if (!photo) return;
    let url: string | null = null;
    let live = true;
    (async () => {
      try {
        let blob = await get<Blob>(photo.local ? photoBlobKey(photo.id) : photoCacheKey(photo.id)).catch(() => undefined);
        if (!blob && !photo.local) {
          blob = await getBlob(`/photos/${photo.id}`);
          set(photoCacheKey(photo.id), blob).catch(() => {});
        }
        if (!blob) throw new Error('missing');
        url = URL.createObjectURL(blob);
        if (live) setState({ url, failed: false });
      } catch {
        if (live) setState({ url: null, failed: true });
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo?.id, photo?.local]);

  return state;
}
