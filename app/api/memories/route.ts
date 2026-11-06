import { del, get, list, put } from '@vercel/blob'
import { NextResponse } from 'next/server'

type MemoryRecord = {
  pathname: string
  contentType: string
  data: string
  kind: 'image' | 'video'
  uploadedAt: string
}

type GlobalMemoryState = {
  memories?: MemoryRecord[]
}

const globalState = globalThis as typeof globalThis & GlobalMemoryState

function getMemoryStore() {
  if (!globalState.memories) {
    globalState.memories = []
  }
  return globalState.memories
}

function getMediaKind(file: File): 'image' | 'video' | null {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogg)$/i.test(file.name)

  if (isImage) return 'image'
  if (isVideo) return 'video'
  return null
}

async function serveStoredMemory(pathname: string) {
  const entry = getMemoryStore().find((memory) => memory.pathname === pathname)
  if (!entry) return null

  return new NextResponse(Buffer.from(entry.data, 'base64'), {
    headers: {
      'Content-Type': entry.contentType,
      'Cache-Control': 'private, no-cache',
    },
  })
}

export async function GET(request: Request) {
  const pathname = new URL(request.url).searchParams.get('pathname')
  if (pathname) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const response = await serveStoredMemory(pathname)
      if (response) return response
      return new NextResponse('Not found', { status: 404 })
    }

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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({
      memories: getMemoryStore()
        .slice()
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .map((memory) => ({
          url: `/api/memories?pathname=${encodeURIComponent(memory.pathname)}`,
          pathname: memory.pathname,
          uploadedAt: memory.uploadedAt,
          kind: memory.kind,
          userUploaded: true,
        })),
    })
  }

  const { blobs } = await list({ prefix: 'memories/' })
  return NextResponse.json({
    memories: blobs
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .map((blob) => ({
        url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`,
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
        kind: blob.contentType?.startsWith('video/') ? 'video' : 'image',
        userUploaded: true,
      })),
  })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Please choose an image or video file.' }, { status: 400 })

    const mediaKind = getMediaKind(file)
    if (!mediaKind) return NextResponse.json({ error: 'Please choose an image or video file.' }, { status: 400 })

    const maxSize = mediaKind === 'video' ? 25 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      const maxSizeText = mediaKind === 'video' ? '25MB' : '10MB'
      return NextResponse.json({ error: `Each ${mediaKind} must be smaller than ${maxSizeText}.` }, { status: 400 })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
      const pathname = `memories/${Date.now()}-${safeName}`
      getMemoryStore().unshift({
        pathname,
        contentType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()).toString('base64'),
        kind: mediaKind,
        uploadedAt: new Date().toISOString(),
      })

      return NextResponse.json({
        memory: {
          url: `/api/memories?pathname=${encodeURIComponent(pathname)}`,
          pathname,
          kind: mediaKind,
          userUploaded: true,
        },
      })
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
    const blob = await put(`memories/${Date.now()}-${safeName}`, file, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type,
    })

    return NextResponse.json({
      memory: {
        url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`,
        pathname: blob.pathname,
        kind: mediaKind,
        userUploaded: true,
      },
    })
  } catch (error) {
    console.error('[v0] Memory upload failed:', error)
    return NextResponse.json({ error: 'The media could not be saved. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const pathname = new URL(request.url).searchParams.get('pathname')
    if (!pathname) return NextResponse.json({ error: 'Memory not found.' }, { status: 400 })

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const store = getMemoryStore()
      const index = store.findIndex((memory) => memory.pathname === pathname)
      if (index >= 0) store.splice(index, 1)
      return NextResponse.json({ success: true })
    }

    await del(pathname)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Memory deletion failed:', error)
    return NextResponse.json({ error: 'The memory could not be deleted. Please try again.' }, { status: 500 })
  }
}
