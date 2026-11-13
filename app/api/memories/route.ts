import { del, get, list, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { getMediaContentType } from '@/lib/memory-media'

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
  const isVideo = /\.(mp4|webm)$/i.test(file.name)

  if (isImage) return 'image'
  if (isVideo) return 'video'
  return null
}

function parseByteRange(rangeHeader: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader)
  if (!match || size === 0 || (!match[1] && !match[2])) return null

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (suffixLength <= 0) return null
    return { start: Math.max(size - suffixLength, 0), end: size - 1 }
  }

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

async function serveStoredMemory(pathname: string, rangeHeader: string | null) {
  const entry = getMemoryStore().find((memory) => memory.pathname === pathname)
  if (!entry) return null

  const data = Buffer.from(entry.data, 'base64')
  const headers = new Headers({
    'Content-Type': entry.contentType,
    'Cache-Control': 'private, no-cache',
  })

  if (entry.kind !== 'video') {
    return new NextResponse(data, { headers })
  }

  headers.set('Accept-Ranges', 'bytes')

  if (!rangeHeader) {
    headers.set('Content-Length', String(data.length))
    return new NextResponse(data, { headers })
  }

  const range = parseByteRange(rangeHeader, data.length)
  if (!range) {
    headers.set('Content-Range', `bytes */${data.length}`)
    return new NextResponse(null, { status: 416, headers })
  }

  const body = data.subarray(range.start, range.end + 1)
  headers.set('Content-Length', String(body.length))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${data.length}`)
  return new NextResponse(body, { status: 206, headers })
}

export async function GET(request: Request) {
  const pathname = new URL(request.url).searchParams.get('pathname')
  if (pathname) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse('Persistent media storage is not configured.', { status: 503 })
      }

      const response = await serveStoredMemory(pathname, request.headers.get('range'))
      if (response) return response
      return new NextResponse('Not found', { status: 404 })
    }

    const isVideo = /\.(mp4|webm)$/i.test(pathname)
    const rangeHeader = isVideo ? request.headers.get('range') : null
    const result = await get(pathname, {
      access: 'private',
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    })
    if (!result) return new NextResponse('Not found', { status: 404 })

    const headers = new Headers({
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-cache',
      ETag: result.blob.etag,
    })
    const contentRange = result.headers.get('content-range')
    if (isVideo) {
      headers.set('Accept-Ranges', result.headers.get('accept-ranges') ?? 'bytes')
      const contentLength = result.headers.get('content-length')
      if (contentLength) headers.set('Content-Length', contentLength)
      if (contentRange) headers.set('Content-Range', contentRange)
    }

    return new NextResponse(result.stream, {
      status: isVideo && contentRange ? 206 : 200,
      headers,
    })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const uploadsUnavailable = process.env.NODE_ENV === 'production'
    return NextResponse.json({
      clientUploadsEnabled: false,
      uploadsUnavailable,
      memories: (uploadsUnavailable ? [] : getMemoryStore())
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
    clientUploadsEnabled: true,
    memories: blobs
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .map((blob) => ({
        url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`,
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
        kind: /\.(mp4|webm|mov|m4v|avi|mkv|ogg)$/i.test(blob.pathname) ? 'video' : 'image',
        userUploaded: true,
      })),
  })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Please choose an image or an MP4 or WebM video.' }, { status: 400 })

    const mediaKind = getMediaKind(file)
    if (!mediaKind) return NextResponse.json({ error: 'Please choose an image or an MP4 or WebM video.' }, { status: 400 })

    const maxSize = mediaKind === 'video' ? 25 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      const maxSizeText = mediaKind === 'video' ? '25MB' : '10MB'
      return NextResponse.json({ error: `Each ${mediaKind} must be smaller than ${maxSizeText}.` }, { status: 400 })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({
          error: 'Uploads are unavailable because persistent storage is not configured. Connect a Vercel Blob store, then try again.',
        }, { status: 503 })
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
      const pathname = `memories/${Date.now()}-${safeName}`
      getMemoryStore().unshift({
        pathname,
        contentType: getMediaContentType(file),
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
      contentType: getMediaContentType(file),
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
