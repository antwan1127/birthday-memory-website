import { handleUpload } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

const imageExtension = /\.(jpe?g|png|gif|webp|heic|heif)$/i
const videoExtension = /\.(mp4|webm|mov|m4v|avi|mkv|ogg)$/i

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('memories/')) {
          throw new Error('Invalid memory upload path.')
        }

        const filename = pathname.slice('memories/'.length)
        const isImage = imageExtension.test(filename)
        const isVideo = videoExtension.test(filename)
        if (!/^[a-z0-9._-]+$/i.test(filename) || (!isImage && !isVideo)) {
          throw new Error('Please choose a supported image or video file.')
        }

        return {
          allowedContentTypes: isVideo
            ? ['video/*', 'application/octet-stream']
            : ['image/*', 'application/octet-stream'],
          maximumSizeInBytes: isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024,
          addRandomSuffix: false,
        }
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[v0] Memory upload authorization failed:', error)
    return NextResponse.json({ error: 'The media upload could not be started. Please try again.' }, { status: 500 })
  }
}
