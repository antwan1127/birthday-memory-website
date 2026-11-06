'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Heart, ImagePlus, Loader2, LockKeyhole, Sparkles, Upload, X } from 'lucide-react'

type Memory = { url: string; pathname: string; uploadedAt?: string }

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

const starterMemories: Memory[] = [
  { pathname: 'shared-night-view', url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-11-06%20at%206.59.54%20PM-ILEgGsr5HvTIxfauW6jPtx9Q3y6F9H.jpeg' },
  { pathname: 'shared-sunny-day', url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-11-06%20at%207.00.48%20PM-QQIYrK84CbF1E2v0EzlXLTiXlACEBU.jpeg' },
]

export default function RomanticMemory() {
  const [duration, setDuration] = useState(getDuration)
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setDuration(getDuration()), 1000 * 60 * 60)
    fetch('/api/memories').then((response) => response.json()).then((data) => setMemories(data.memories ?? [])).catch(() => undefined).finally(() => setIsLoading(false))
    return () => window.clearInterval(timer)
  }, [])

  const allMemories = [...starterMemories, ...memories]
  const memoryCount = allMemories.length
  const formattedCount = useMemo(() => String(memoryCount).padStart(2, '0'), [memoryCount])

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setIsUploading(true)
    setUploadError(null)
    try {
      for (const file of files) {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
        if (!isImage) {
          setUploadError('Please choose an image file.')
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          setUploadError('Each image must be smaller than 10MB.')
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/memories', { method: 'POST', body: formData })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'The photo could not be saved.')
        setMemories((current) => [data.memory, ...current])
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The photo could not be saved. Please try again.')
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
          {allMemories.map((memory, index) => <button className="photo-tile" key={memory.pathname} onClick={() => setSelectedImage(memory.url)} aria-label={`View memory ${index + 1}`}><img src={memory.url} alt={index === 0 ? 'Us together at night with the city behind us' : index === 1 ? 'Us together on a sunny day' : 'A shared memory'} /></button>)}
          {isLoading && <div className="empty-state"><Loader2 className="spin" size={22} /><span>Finding our memories...</span></div>}
          {!isLoading && allMemories.length === 0 && <div className="empty-state"><ImagePlus size={22} /><span>Your first memory is waiting below</span></div>}
        </div>
        <div className="upload-panel"><div><p className="upload-title">Add to our story</p><p className="upload-subtitle">Keep the little moments close. Images up to 10MB.</p>{uploadError && <p className="upload-error" role="alert">{uploadError}</p>}</div><button className="upload-button" onClick={() => inputRef.current?.click()} disabled={isUploading}>{isUploading ? <Loader2 className="spin" size={17} /> : <Upload size={17} />} {isUploading ? 'Saving...' : 'Add photos'}</button><input ref={inputRef} type="file" accept="image/*" multiple onChange={handleUpload} hidden /></div>
      </section>

      <footer><span><Heart size={13} fill="currentColor" /> made for my love</span><span>one day at a time · forever to go</span></footer>
      {selectedImage && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Memory preview" onClick={() => setSelectedImage(null)}><button className="close-button" onClick={() => setSelectedImage(null)} aria-label="Close preview"><X /></button><img src={selectedImage} alt="Enlarged shared memory" onClick={(event) => event.stopPropagation()} /></div>}
      <div className="privacy-note"><LockKeyhole size={12} /> Only people with this link can see your memories</div>
    </main>
  )
}
