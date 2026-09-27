import { useEffect, useRef, useState } from 'react';
import type { Lang, PhotoRef } from '@smaran/shared';
import { newClientId } from '../lib/api';
import { compressPhoto, keepPendingPhoto, usePhotoUrl } from '../lib/photos';
import { Icon } from './Icon';
import { VoiceField } from './voice';

export interface DraftPhoto {
  clientId: string;
  caption: string;
  takenAt: string;
}

/**
 * Take photos during a visit: the phone's camera opens directly. Each photo is
 * shrunk and kept on the phone, and gets a caption that can be spoken.
 */
export function PhotoCapture({
  photos,
  onChange,
  lang,
}: {
  photos: DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
  lang: Lang;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: DraftPhoto[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const clientId = newClientId();
      await keepPendingPhoto(clientId, await compressPhoto(file));
      added.push({ clientId, caption: '', takenAt: new Date().toISOString() });
    }
    onChange([...photos, ...added]);
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  return (
    <section className="sec photos" aria-label="Photos">
      <h2>Photos</h2>
      {photos.length > 0 && (
        <ul className="photo-list">
          {photos.map((p, i) => (
            <li key={p.clientId}>
              <Thumb photo={{ id: p.clientId, caption: p.caption, takenAt: p.takenAt, local: true }} />
              <div className="photo-cap">
                <VoiceField
                  id={`cap-${p.clientId}`}
                  label={`Caption for photo ${i + 1}`}
                  hideLabel
                  rows={1}
                  lang={lang}
                  value={p.caption}
                  placeholder="What does this show?"
                  onChange={(caption) => onChange(photos.map((x) => (x.clientId === p.clientId ? { ...x, caption } : x)))}
                />
                <button type="button" className="linkbtn danger" onClick={() => onChange(photos.filter((x) => x.clientId !== p.clientId))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => add(e.target.files)} />
      <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="camera" small />
        {busy ? 'Saving photo…' : photos.length ? 'Take another photo' : 'Take a photo'}
      </button>
      <p className="hint">Classroom displays, children’s work, the register. Avoid close-ups of children’s faces.</p>
    </section>
  );
}

/** A photo thumbnail; tap to see it full size. */
export function Thumb({ photo, size = 'md' }: { photo: PhotoRef; size?: 'sm' | 'md' }) {
  const { url, failed } = usePhotoUrl(photo);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`thumb thumb-${size}`} onClick={() => url && setOpen(true)} aria-label={photo.caption ? `Photo: ${photo.caption}` : 'Photo'}>
        {url ? <img src={url} alt="" /> : <span className="thumb-empty">{failed ? 'Photo not on this phone' : ''}</span>}
      </button>
      {open && url && <PhotoViewer url={url} caption={photo.caption} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ThumbRow({ photos }: { photos: PhotoRef[] }) {
  if (!photos.length) return null;
  return (
    <div className="thumb-row">
      {photos.map((p) => (
        <Thumb key={p.id} photo={p} size="sm" />
      ))}
    </div>
  );
}

function PhotoViewer({ url, caption, onClose }: { url: string; caption: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <img src={url} alt={caption} />
      {caption && <p>{caption}</p>}
      <button type="button" className="viewer-x" aria-label="Close photo" onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}
