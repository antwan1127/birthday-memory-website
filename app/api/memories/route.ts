import { get, list, put } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const pathname = new URL(request.url).searchParams.get('pathname')
  if (pathname) {
    const result = await get(pathname, { access: 'private' })
    if (!result) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  }

  const { blobs } = await list({ prefix: 'memories/' })
  return NextResponse.json({ memories: blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).map((blob) => ({ url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`, pathname: blob.pathname, uploadedAt: blob.uploadedAt })) })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 })
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
    if (!isImage) return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Each image must be smaller than 10MB.' }, { status: 400 })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
    const blob = await put(`memories/${Date.now()}-${safeName}`, file, { access: 'private', addRandomSuffix: false, contentType: file.type })
    return NextResponse.json({ memory: { url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`, pathname: blob.pathname } })
  } catch (error) {
    console.error('[v0] Memory upload failed:', error)
    return NextResponse.json({ error: 'The photo could not be saved. Please try again.' }, { status: 500 })
  }
}
