import { useEffect, useRef, useState } from 'react'
import Turntable from '../components/Turntable'
import { Btn, Wave, fmt } from '../components/ui'
import { PRESETS, STYLES } from '../lib/presets'
import { db, type StoredRecord } from '../lib/db'

export default function Player({ record, onClose }: { record: StoredRecord; onClose: () => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const objectUrl = URL.createObjectURL(record.master)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [record.master])
  const [engaged, setEngaged] = useState(false)
  const [contact, setContact] = useState(false)
  const [t, setT] = useState(0)
  const [reset, setReset] = useState(0)
  const [styleId, setStyleId] = useState(record.styleId)
  const [full, setFull] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const lastPlayedAt = useRef(record.lastPlayedAt)
  const [labelPhoto, setLabelPhoto] = useState(record.labelPhoto)
  const [photoPreview, setPhotoPreview] = useState<string>()
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  useEffect(() => {
    if (!labelPhoto) { setPhotoPreview(undefined); return }
    const photoUrl = URL.createObjectURL(labelPhoto)
    setPhotoPreview(photoUrl)
    return () => URL.revokeObjectURL(photoUrl)
  }, [labelPhoto])
  const style = STYLES.find((s) => s.id === styleId)!
  const preset = PRESETS.find((p) => p.id === record.presetId)!
  const dur = record.duration, progress = dur ? t / dur : 0

  // audio starts only at needle contact
  useEffect(() => {
    const a = audio.current!
    if (engaged && contact) a.play().catch(() => setEngaged(false))
    else a.pause()
  }, [engaged, contact])

  const seek = (s: number) => { const a = audio.current!; a.currentTime = Math.max(0, Math.min(dur, s)); setT(a.currentTime) }
  const toggle = () => {
    if (!engaged && t >= dur - 0.05) seek(0)
    setEngaged((e) => !e); navigator.vibrate?.(10)
    if (!engaged) {
      lastPlayedAt.current = Date.now()
      db.put({ ...record, styleId, labelPhoto, lastPlayedAt: lastPlayedAt.current })
    }
  }
  const savePhoto = async (file?: File) => {
    setPhotoError('')
    if (file && file.size > 20 * 1024 * 1024) { setPhotoError('Choose a photo smaller than 20 MB.'); return }
    setPhotoBusy(true)
    try {
      let photo: Blob | undefined
      if (file) {
        const bitmap = await createImageBitmap(file)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 768
          const context = canvas.getContext('2d')!
          const crop = Math.min(bitmap.width, bitmap.height)
          context.fillStyle = '#fff7e6'; context.fillRect(0, 0, 768, 768)
          context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, 768, 768)
          photo = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Photo conversion failed')), 'image/jpeg', 0.9))
        } finally { bitmap.close() }
      }
      await db.put({ ...record, styleId, labelPhoto: photo, lastPlayedAt: lastPlayedAt.current })
      setLabelPhoto(photo)
    } catch {
      setPhotoError('Could not save this photo. Try a JPG, PNG, or WebP, and check available device storage.')
    } finally { setPhotoBusy(false) }
  }
  const status = !engaged ? (t > 0 && t < dur ? 'Paused' : 'Idle') : contact ? 'Playing' : 'Needle dropping…'

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-obsidian">
      <audio ref={audio} src={url} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={() => { setEngaged(false); setT(dur) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(80% 50% at 50% 30%, rgba(217,119,6,.22), transparent 70%), radial-gradient(60% 40% at 50% 100%, rgba(153,27,27,.18), transparent)' }} />
      <header className="relative z-10 flex items-center justify-between px-5 pt-3">
        <button onClick={onClose} className="min-h-11 text-sm text-muted hover:text-cream" aria-label="Back to vault">← Vault</button>
        <span className="font-mono text-[11px] text-amber-bright" aria-live="polite">{status}</span>
        <div className="flex gap-1">
          <button onClick={() => setReset((r) => r + 1)} className="min-h-11 px-2 text-xs text-muted hover:text-cream">Reset view</button>
          <button onClick={() => setFull((f) => !f)} className="min-h-11 px-2 text-xs text-muted hover:text-cream">{full ? 'Exit' : 'Full'}</button>
        </div>
      </header>

      <div className={`relative ${full ? 'flex-1' : 'h-[46%]'} transition-all`}>
        <Turntable className="absolute inset-0" style={style} label={{ title: record.title, recipient: record.recipient, side: record.sideA, date: record.date }}
          engaged={engaged} progress={progress} onContact={setContact} resetKey={reset} playbackRef={audio} labelPhoto={labelPhoto} />
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a loved-one photo" className="hidden" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void savePhoto(file) }} />
        <button type="button" disabled={photoBusy} onClick={() => photoInput.current?.click()} aria-label={labelPhoto ? 'Change record label photo' : 'Add record label photo'} className="absolute left-4 top-3 z-10 flex min-h-11 items-center gap-2 rounded-full border border-amber/40 bg-obsidian px-3 text-xs text-cream transition hover:border-amber-bright hover:bg-panel disabled:cursor-wait disabled:opacity-50">
          {photoPreview ? <img src={photoPreview} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="text-lg text-amber-bright" aria-hidden="true">＋</span>}
          {photoBusy ? 'Saving photo…' : labelPhoto ? 'Change photo' : 'Add loved-one photo'}
        </button>
        {full && photoError && <p role="alert" className="absolute inset-x-4 bottom-10 rounded-lg border border-err/30 bg-obsidian/90 p-3 text-xs leading-relaxed text-err">{photoError}</p>}
        <p className="pointer-events-none absolute bottom-2 w-full text-center text-[10px] text-muted/60">Drag to orbit · pinch to zoom · double-tap to reset</p>
      </div>

      {!full && (
        <div className="no-scrollbar relative flex-1 overflow-y-auto px-6 pb-4">
          <p className="deco text-[10px] text-amber-bright">{record.occasion} · {record.date}</p>
          <h1 className="mt-1 font-display text-3xl leading-tight">{record.title}</h1>
          <p className="text-sm text-muted">for {record.recipient} · from {record.sender}</p>

          <div className="mt-4 h-10 cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur) }}>
            <Wave data={record.wave} progress={progress} className="h-full" />
          </div>
          <input type="range" min={0} max={dur} step={0.1} value={t} onChange={(e) => seek(+e.target.value)} aria-label="Seek" className="sr-only" />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted"><span>{fmt(t)}</span><span>-{fmt(Math.max(0, dur - t))}</span></div>

          <div className="mt-3 flex items-center justify-center gap-6">
            <button onClick={() => seek(t - 10)} className="min-h-11 font-mono text-sm text-muted hover:text-cream" aria-label="Back 10 seconds">−10</button>
            <button onClick={toggle} aria-label={engaged ? 'Pause' : 'Play'} className="grid h-16 w-16 place-items-center rounded-full bg-amber text-obsidian shadow-[0_0_40px_-8px_#f59e0b] transition hover:bg-amber-bright">
              {engaged ? <span className="flex gap-1.5"><span className="h-5 w-1.5 bg-obsidian" /><span className="h-5 w-1.5 bg-obsidian" /></span> : <span className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-obsidian" />}
            </button>
            <button onClick={() => seek(t + 10)} className="min-h-11 font-mono text-sm text-muted hover:text-cream" aria-label="Forward 10 seconds">+10</button>
          </div>

          <blockquote className="mt-5 border-l-2 border-brass/50 pl-4 font-display text-lg italic leading-snug text-cream/90">“{record.dedication}”</blockquote>

          <div className="mt-5 flex gap-2">
            {STYLES.map((s) => <button key={s.id} onClick={() => setStyleId(s.id)} aria-label={s.name} aria-pressed={s.id === styleId} className={`h-8 w-8 rounded-full border-2 ${s.id === styleId ? 'border-amber-bright' : 'border-transparent'}`} style={{ background: `radial-gradient(${s.label} 30%, ${s.disc} 32%)` }} />)}
            <span className="ml-auto self-center rounded-full border border-brass/30 px-3 py-1 text-[11px] text-muted">{preset.name}</span>
          </div>
          <section className="mt-4 rounded-xl border border-brass/25 bg-panel/70 p-3" aria-labelledby="record-photo-title">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-amber/40 bg-stone">
                {photoPreview ? <img src={photoPreview} alt="Your record label photo" className="h-full w-full object-cover" /> : <span className="font-display text-xl text-amber-bright" aria-hidden="true">♡</span>}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="record-photo-title" className="font-display text-sm">A face on the record.</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">A loved-one photo, on the spinning label.</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={photoBusy} onClick={() => photoInput.current?.click()} className="min-h-11 flex-1 rounded-lg border border-amber/40 bg-amber/10 px-3 text-xs text-cream transition hover:bg-amber/20 disabled:cursor-wait disabled:opacity-50">{photoBusy ? 'Saving photo…' : labelPhoto ? 'Replace photo' : 'Add a loved-one photo'}</button>
              {labelPhoto && <button type="button" disabled={photoBusy} onClick={() => void savePhoto()} className="min-h-11 rounded-lg px-3 text-xs text-muted hover:text-cream disabled:opacity-50">Remove photo</button>}
            </div>
            <p className="mt-1 text-[10px] text-muted/80">Centered circular crop · saved only on this device</p>
            {photoError && <p role="alert" className="mt-2 text-xs leading-relaxed text-err">{photoError}</p>}
          </section>
          <a href={url} download={`${record.title}.wav`} className="mt-4 block"><Btn variant="ghost" className="w-full" tabIndex={-1}>Export WAV master</Btn></a>
        </div>
      )}
    </div>
  )
}
