export const photoLimit = 2;
export const isCompressedPhoto = value => typeof value === 'string' && value.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
