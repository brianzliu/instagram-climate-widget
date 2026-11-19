import React, { useId, useState } from 'react';
import { compressImage } from '../extension/compress.js';
import { photoLimit } from './action-photos.js';

const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export function ActionPhotos({ images, label = 'Photo', className = '' }) {
  if (!images?.length) return null;
  return <div className={`action-photos ${className}`}>{images.map((image, index) =>
    <img key={index} src={image} loading="lazy" alt={`${label} ${index + 1} of ${images.length}`} />)}</div>;
}

export function PhotoPicker({ images, onChange, onBusy }) {
  const id = useId();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function choose(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    if (!files.length) return;
    setError('');
    if (files.length + images.length > photoLimit) { setError('Choose up to two photos.'); return; }
    if (files.some(file => !accepted.includes(file.type) || file.size > 12 * 1024 * 1024)) {
      setError('Choose JPEG, PNG, WebP, or AVIF photos under 12 MB each.');
      return;
    }
    setLoading(true);
    onBusy(true);
    try {
      const next = await Promise.all(files.map(async file => {
        const url = URL.createObjectURL(file);
        try { return await compressImage(url, { edge: 640 }); }
        finally { URL.revokeObjectURL(url); }
      }));
      onChange([...images, ...next]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); onBusy(false); }
  }

  return <div className="photo-picker">
    <label htmlFor={id}>Photos <span className="muted">optional, up to two</span></label>
    <input id={id} type="file" accept={accepted.join(',')} multiple disabled={loading || images.length >= photoLimit} onChange={choose} />
    {loading && <p role="status">Preparing photos…</p>}
    {error && <p role="alert">{error}</p>}
    {!!images.length && <div className="photo-previews">{images.map((image, index) =>
      <figure key={index}><img src={image} alt={`Selected photo ${index + 1}`} />
        <button className="text-button" type="button" disabled={loading} onClick={() => onChange(images.filter((_, i) => i !== index))}>Remove photo {index + 1}</button></figure>)}</div>}
  </div>;
}
