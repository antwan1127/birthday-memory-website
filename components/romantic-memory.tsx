'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Heart, ImagePlus, Loader2, LockKeyhole, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { getMediaContentType } from '@/lib/memory-media'

type Memory = {
  url: string
  pathname: string
  uploadedAt?: string
  kind: 'image' | 'video'
  userUploaded?: boolean
}

const startedDating = new Date(2023, 10, 24)

function getDuration() {
  const now = new Date()
  let years = now.getFullYear() - startedDating.getFullYear()
  let months = now.getMonth() - startedDating.getMonth()
  let days = now.getDate() - startedDating.getDate()
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate() }
  if (months < 0) { years -= 1; months += 12 }
  return { years, months, days }
}

function getMediaKind(file: File): Memory['kind'] | null {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(file.name)

  if (isImage) return 'image'
  if (isVideo) return 'video'
  return null
}

const starterMemories: Memory[] = [
  { pathname: 'shared-night-view', url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-11-06%20at%206.59.54%20PM-ILEgGsr5HvTIxfauW6jPtx9Q3y6F9H.jpeg', kind: 'image', userUploaded: false },
  { pathname: 'shared-sunny-day', url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-11-06%20at%207.00.48%20PM-QQIYrK84CbF1E2v0EzlXLTiXlACEBU.jpeg', kind: 'image', userUploaded: false },
]

export default function RomanticMemory() {
  const [password, setPassword] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [duration, setDuration] = useState(getDuration)
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [clientUploadsEnabled, setClientUploadsEnabled] = useState(false)
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsUnlocked(window.sessionStorage.getItem('birthday-memory-unlocked') === 'true')
  }, [])

  useEffect(() => {
    if (!isUnlocked) return

    const timer = window.setInterval(() => setDuration(getDuration()), 1000 * 60 * 60)
    fetch('/api/memories')
      .then((response) => {
        if (!response.ok) throw new Error('Memories could not be loaded.')
        return response.json()
      })
      .then((data) => {
        setMemories((data.memories ?? []).map((memory: Memory) => ({ ...memory, kind: memory.kind ?? 'image', userUploaded: true })))
        setClientUploadsEnabled(Boolean(data.clientUploadsEnabled))
        if (data.uploadsUnavailable) {
          setUploadError('Photo and video uploads need persistent storage. Connect a Vercel Blob store to this project.')
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false))
    return () => window.clearInterval(timer)
  }, [isUnlocked])

  const allMemories = [...starterMemories, ...memories]
  const memoryCount = allMemories.length
  const formattedCount = useMemo(() => String(memoryCount).padStart(2, '0'), [memoryCount])

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password === '24/11/2023') {
      window.sessionStorage.setItem('birthday-memory-unlocked', 'true')
      setPasswordError('')
      setIsUnlocked(true)
      return
    }
    setPasswordError('That is not the right password.')
  }

  if (!isUnlocked) {
    return (
      <main className="password-screen">
        <section className="password-card" aria-labelledby="password-title">
          <div className="password-icon" aria-hidden="true"><LockKeyhole size={24} /></div>
          <p className="eyebrow">a private little place</p>
          <h1 id="password-title">For your eyes<br /><em>only.</em></h1>
          <p className="password-intro">Enter the password to open our scrapbook.</p>
          <form className="password-form" onSubmit={handlePasswordSubmit}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="off"
              autoFocus
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'password-error' : undefined}
            />
            {passwordError && <p className="password-error" id="password-error" role="alert">{passwordError}</p>}
            <button type="submit">Open our memories <Heart size={15} fill="currentColor" /></button>
          </form>
        </section>
      </main>
    )
  }

  async function handleDelete(memory: Memory, event?: React.MouseEvent) {
    event?.stopPropagation()
    if (!memory.userUploaded) return

    try {
      const response = await fetch(`/api/memories?pathname=${encodeURIComponent(memory.pathname)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'The memory could not be deleted.')

      setMemories((current) => current.filter((item) => item.pathname !== memory.pathname))
      setSelectedMemory((current) => (current?.pathname === memory.pathname ? null : current))
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The memory could not be deleted. Please try again.')
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setIsUploading(true)
    setUploadError(null)
    try {
      for (const file of files) {
        const mediaKind = getMediaKind(file)
        if (!mediaKind) {
          setUploadError('Please choose an image or an MP4, MOV, M4V, or WebM video.')
          continue
        }

        const maxSize = mediaKind === 'video' ? 25 * 1024 * 1024 : 10 * 1024 * 1024
        if (file.size > maxSize) {
          setUploadError(mediaKind === 'video' ? 'Each video must be smaller than 25MB.' : 'Each image must be smaller than 10MB.')
          continue
        }

        if (!clientUploadsEnabled && file.size > 4 * 1024 * 1024) {
          setUploadError('This file is too large for the current upload setup. Configure Vercel Blob storage to upload larger photos and videos.')
          continue
        }

        if (clientUploadsEnabled) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
          const blob = await upload(`memories/${Date.now()}-${crypto.randomUUID()}-${safeName}`, file, {
            access: 'private',
            handleUploadUrl: '/api/memories/upload',
            contentType: getMediaContentType(file),
            multipart: file.size > 5 * 1024 * 1024,
          })
          setMemories((current) => [{
            url: `/api/memories?pathname=${encodeURIComponent(blob.pathname)}`,
            pathname: blob.pathname,
            kind: mediaKind,
            userUploaded: true,
          }, ...current])
          continue
        }

        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/memories', { method: 'POST', body: formData })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'The media could not be saved.')
        setMemories((current) => [{ ...data.memory, userUploaded: true, kind: data.memory.kind ?? mediaKind }, ...current])
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The media could not be saved. Please try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <main className="site-shell">
      <section className="hero-section" aria-labelledby="page-title">
        <div className="topbar"><span className="brand-mark"><Heart size={15} fill="currentColor" /> us, always</span><span className="date-pill">since 24 · 11 · 23</span></div>
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> a little place for us</p>
          <h1 id="page-title">To my favorite<br /><em>person.</em></h1>
          <p className="intro">Happy birthday, my love. Every day with you is my favorite chapter, and this little corner of the internet is a scrapbook for all the moments I never want to forget.</p>
          <div className="signature">Forever yours,<br /><strong>Your favorite person</strong> <Heart size={14} fill="currentColor" /></div>
        </div>
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-sticker"><Heart size={19} fill="currentColor" /><span>made with<br />all my love</span></div>
      </section>

      <section className="counter-section" aria-labelledby="counter-title">
        <div><p className="eyebrow">our little timeline</p><h2 id="counter-title">Look how far<br /><em>we&apos;ve come.</em></h2></div>
        <div className="counter-grid" aria-label={`Together for ${duration.years} years, ${duration.months} months, and ${duration.days} days`}>
          {[[duration.years, 'years'], [duration.months, 'months'], [duration.days, 'days']].map(([value, label]) => <div className="counter-item" key={label}><strong>{String(value).padStart(2, '0')}</strong><span>{label}</span></div>)}
        </div>
        <p className="counter-note"><Heart size={13} fill="currentColor" /> Since the day you made my world softer</p>
      </section>

      <section className="gallery-section" aria-labelledby="gallery-title">
        <div className="section-heading"><div><p className="eyebrow">our shared scrapbook</p><h2 id="gallery-title">Little moments,<br /><em>big feelings.</em></h2></div><span className="photo-count"><Camera size={15} /> {formattedCount} {memoryCount === 1 ? 'memory' : 'memories'}</span></div>
        <div className="gallery-grid">
          {allMemories.map((memory, index) => (
            <div className="photo-tile" key={`${memory.pathname}-${index}`}>
              <button className="photo-tile__button" type="button" onClick={() => setSelectedMemory(memory)} aria-label={`View memory ${index + 1}`}>
                {memory.kind === 'video' ? (
                  <video src={memory.url} playsInline muted loop />
                ) : (
                  <img src={memory.url} alt={index === 0 ? 'Us together at night with the city behind us' : index === 1 ? 'Us together on a sunny day' : 'A shared memory'} />
                )}
              </button>
              {memory.userUploaded && (
                <button type="button" className="delete-button" onClick={(event) => handleDelete(memory, event)} aria-label={`Delete memory ${index + 1}`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {isLoading && <div className="empty-state"><Loader2 className="spin" size={22} /><span>Finding our memories...</span></div>}
          {!isLoading && allMemories.length === 0 && <div className="empty-state"><ImagePlus size={22} /><span>Your first memory is waiting below</span></div>}
        </div>
        <div className="upload-panel"><div><p className="upload-title">Add to our story</p><p className="upload-subtitle">Keep the little moments close. Photos up to 10MB; MP4, MOV, M4V, or WebM videos up to 25MB.</p>{uploadError && <p className="upload-error" role="alert">{uploadError}</p>}</div><button className="upload-button" onClick={() => inputRef.current?.click()} disabled={isUploading}>{isUploading ? <Loader2 className="spin" size={17} /> : <Upload size={17} />} {isUploading ? 'Saving...' : 'Add photos & videos'}</button><input ref={inputRef} type="file" accept="image/*,video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm" multiple onChange={handleUpload} hidden /></div>
      </section>

      <footer><span><Heart size={13} fill="currentColor" /> made for my love</span><span>one day at a time · forever to go</span></footer>
      {selectedMemory && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Memory preview" onClick={() => setSelectedMemory(null)}>
          <button className="close-button" onClick={() => setSelectedMemory(null)} aria-label="Close preview"><X /></button>
          {selectedMemory.kind === 'video' ? (
            <video className="lightbox-media" src={selectedMemory.url} controls playsInline preload="metadata" onClick={(event) => event.stopPropagation()} />
          ) : (
            <img className="lightbox-media" src={selectedMemory.url} alt="Enlarged shared memory" onClick={(event) => event.stopPropagation()} />
          )}
        </div>
      )}
      <div className="privacy-note"><LockKeyhole size={12} /> Only people with this link can see your memories</div>
    </main>
  )
}
