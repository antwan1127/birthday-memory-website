export function getMediaContentType(file: Pick<File, 'name' | 'type'>): string {
  if (/\.mp4$/i.test(file.name)) return 'video/mp4'
  if (/\.mov$/i.test(file.name)) return 'video/quicktime'
  if (/\.m4v$/i.test(file.name)) return 'video/mp4'
  if (/\.webm$/i.test(file.name)) return 'video/webm'
  return file.type || 'application/octet-stream'
}
