export async function compressImage(dataUrl, { edge = 448, quality = 0.62 } = {}) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This photo could not be decoded.')); image.src = dataUrl; });
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { alpha: false }); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let output = canvas.toDataURL('image/jpeg', quality);
  if (output.length > 200000) output = canvas.toDataURL('image/jpeg', 0.35);
  if (output.length > 200000) throw new Error('Compressed photo exceeds the upload limit.');
  return output;
}
