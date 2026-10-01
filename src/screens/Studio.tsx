import { useEffect, useRef, useState } from 'react'
import { Btn, Eyebrow, Meter, Wave, fmt } from '../components/ui'
import { OCCASIONS, PRESETS, STYLES } from '../lib/presets'
import { SR, decodeToMono, demoPad, demoVoice, encodeWav, renderMaster, waveform } from '../lib/dsp'
import { db, type StoredRecord } from '../lib/db'
import Turntable from '../components/Turntable'

const STEPS = ['Capture', 'Dedication', 'Character', 'Appearance', 'Press']
const MAX = 180

export default function Studio({ onDone }: { onDone: (r: StoredRecord) => void }) {
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<Float32Array | null>(null)
  const [meta, setMeta] = useState({ title: 'The Porch Song', recipient: 'Nana Ruth', sender: 'Theo', dedication: 'For every summer evening you hummed this to me.', occasion: 'Grandparents', date: new Date().toISOString().slice(0, 10), sideA: 'Side A', sideB: 'Side B' })
  const [presetId, setPreset] = useState('warm')
  const [styleId, setStyle] = useState('ruby')
  const [music, setMusic] = useState<'none' | 'pad'>('pad')
  const [musicLevel, setMusicLevel] = useState(0.35)
  const [render, setRender] = useState<{ p: number; stage: string } | null>(null)
  const style = STYLES.find((s) => s.id === styleId)!

  return (
    <div className="flex h-full flex-col">
      <header className="px-6 pt-4">
        <Eyebrow>Studio · {STEPS[step]}</Eyebrow>
        <div className="mt-3 flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemax={5}>
          {STEPS.map((s, i) => <span key={s} className={`h-0.5 flex-1 rounded-full ${i <= step ? 'bg-amber' : 'bg-cream/10'}`} />)}
        </div>
      </header>
      <div className="no-scrollbar flex-1 overflow-y-auto px-6 pb-6 pt-5">
        {step === 0 && <Capture source={source} setSource={setSource} />}
        {step === 1 && <Dedication meta={meta} setMeta={setMeta} />}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="font-display text-3xl leading-tight">How old should it sound?</h2>
            <p className="text-sm text-muted">Each character is a complete recipe — tape warmth, wow, surface hush, crackle and pops.</p>
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => { setPreset(p.id); navigator.vibrate?.(8) }} aria-pressed={presetId === p.id}
                className={`w-full rounded-2xl border p-4 text-left transition ${presetId === p.id ? 'border-amber bg-amber/10' : 'border-brass/20 bg-panel hover:border-brass/50'}`}>
                <div className="flex items-baseline justify-between"><span className="font-display text-xl">{p.name}</span>{presetId === p.id && <span className="deco text-[10px] text-amber-bright">Selected</span>}</div>
                <p className="mb-3 mt-1 text-[13px] text-muted">{p.blurb}</p>
                <div className="space-y-1"><Meter n={p.warmth} label="Warmth" /><Meter n={p.age} label="Age" /><Meter n={p.texture} label="Texture" /></div>
              </button>
            ))}
            <div className="rounded-2xl border border-brass/20 bg-panel p-4">
              <p className="deco text-[11px] text-muted">Background atmosphere</p>
              <div className="mt-3 flex gap-2">
                {(['none', 'pad'] as const).map((m) => <button key={m} onClick={() => setMusic(m)} className={`flex-1 rounded-full border py-2 text-sm ${music === m ? 'border-amber text-cream' : 'border-brass/25 text-muted'}`}>{m === 'none' ? 'No background' : 'Parlour Strings'}</button>)}
              </div>
              {music !== 'none' && <label className="mt-3 flex items-center gap-3 text-xs text-muted">Level<input type="range" min={0} max={1} step={0.01} value={musicLevel} onChange={(e) => setMusicLevel(+e.target.value)} className="flex-1 accent-amber" /></label>}
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 className="font-display text-3xl">Choose the wax.</h2>
            <div className="relative -mx-6 my-2 h-64"><Turntable className="absolute inset-0" style={style} label={{ title: meta.title, recipient: meta.recipient, side: meta.sideA, date: meta.date }} engaged={false} progress={0} /></div>
            <div className="grid grid-cols-5 gap-2">
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => setStyle(s.id)} aria-label={s.name} aria-pressed={styleId === s.id}
                  className={`aspect-square rounded-full border-2 p-1 transition ${styleId === s.id ? 'border-amber-bright scale-105' : 'border-transparent'}`}>
                  <span className="grid h-full place-items-center rounded-full" style={{ background: `repeating-radial-gradient(${s.disc} 0 2px, color-mix(in srgb, ${s.disc} 80%, white) 3px)` }}>
                    <span className="h-1/3 w-1/3 rounded-full" style={{ background: s.label }} />
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center font-display text-lg">{style.name}</p>
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col items-center pt-6 text-center">
            <div className={`relative grid h-48 w-48 place-items-center rounded-full ${render ? 'animate-spin [animation-duration:1.8s]' : ''}`} style={{ background: `repeating-radial-gradient(${style.disc} 0 2px, #2a2522 3px 4px)` }}>
              <span className="grid h-16 w-16 place-items-center rounded-full font-display text-xs" style={{ background: style.label, color: style.ink }}>VR</span>
            </div>
            <h2 className="mt-8 font-display text-3xl">{render ? 'Pressing your record' : 'Ready to press.'}</h2>
            <p className="mt-2 text-sm text-muted">{render ? render.stage : `${PRESETS.find((p) => p.id === presetId)!.name} · ${style.name}. Every crackle is computed on this device.`}</p>
            {render && <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-cream/10"><div className="h-full bg-amber transition-[width]" style={{ width: `${render.p * 100}%` }} /></div>}
            {render && <p className="mt-2 font-mono text-xs text-muted">{Math.round(render.p * 100)}%</p>}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-brass/15 px-6 py-3">
        <Btn variant="quiet" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || !!render}>Back</Btn>
        {step < 4 ? (
          <Btn onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !source}>Continue</Btn>
        ) : (
          <Btn disabled={!!render || !source} onClick={async () => {
            const id = crypto.randomUUID(), preset = PRESETS.find((p) => p.id === presetId)!
            setRender({ p: 0, stage: 'Preparing source' })
            const [l, r] = await renderMaster(source!, { preset, seed: id, music: music === 'pad' ? demoPad() : null, musicLevel, onProgress: (p, stage) => setRender({ p: p * 0.9, stage }) })
            setRender({ p: 0.94, stage: 'Encoding' }); await new Promise((r) => setTimeout(r, 30))
            const master = encodeWav(l, r)
            setRender({ p: 0.98, stage: 'Generating waveform' })
            const rec: StoredRecord = { id, ...meta, presetId, styleId, duration: l.length / SR, wave: waveform(l), createdAt: Date.now(), favorite: false, master }
            await db.put(rec); navigator.vibrate?.([10, 40, 20])
            setRender(null); setStep(0); setSource(null); onDone(rec)
          }}>Press record</Btn>
        )}
      </footer>
    </div>
  )
}

function Capture({ source, setSource }: { source: Float32Array | null; setSource: (s: Float32Array | null) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'paused' | 'denied'>('idle')
  const [t, setT] = useState(0)
  const [level, setLevel] = useState(0)
  const [live, setLive] = useState<number[]>([])
  const mr = useRef<MediaRecorder | null>(null)
  const raf = useRef(0)
  const previewUrl = useRef<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => () => { cancelAnimationFrame(raf.current); mr.current?.stream.getTracks().forEach((t) => t.stop()) }, [])
  useEffect(() => {
    if (!source) return setUrl(null)
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = URL.createObjectURL(encodeWav(source, source)); setUrl(previewUrl.current)
  }, [source])

  const start = async () => {
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return setState('denied') }
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize), chunks: Blob[] = []
    const rec = new MediaRecorder(stream); mr.current = rec
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); ctx.close(); setSource(await decodeToMono(new Blob(chunks, { type: rec.mimeType }))); setState('idle') }
    rec.start(250); setState('rec'); setLive([]); setT(0); navigator.vibrate?.(12)
    let lastT = performance.now()
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop)
      if (rec.state === 'recording') {
        an.getFloatTimeDomainData(buf); let pk = 0
        for (const v of buf) pk = Math.max(pk, Math.abs(v))
        setLevel(pk); setLive((l) => [...l.slice(-59), pk])
        setT((x) => { const nx = x + (now - lastT) / 1000; if (nx >= MAX) rec.stop(); return nx })
      }
      lastT = now
    }
    raf.current = requestAnimationFrame(loop)
  }
  const stop = () => { cancelAnimationFrame(raf.current); mr.current?.stop() }

  return (
    <div>
      <h2 className="font-display text-[34px] leading-[1.05]">A voice they can return to.</h2>
      <p className="mt-2 text-sm text-muted">Speak, sing, or hum. Up to three minutes, kept on this device.</p>

      <div className="mt-6 rounded-3xl border border-brass/25 bg-panel p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-3xl tabular-nums">{fmt(t)}</span>
          <span className="font-mono text-xs text-muted">/ {fmt(MAX)}</span>
        </div>
        <div className="mt-4 h-16"><Wave data={live.length ? live.map((v) => Math.min(1, v * 2.5)) : Array(60).fill(0.05)} /></div>
        <div className="mt-2 h-1 rounded-full bg-cream/10"><div className={`h-full rounded-full ${level > 0.95 ? 'bg-err' : 'bg-amber'}`} style={{ width: `${Math.min(100, level * 100)}%` }} /></div>
        <p className="mt-2 h-4 text-[11px] text-muted" aria-live="polite">
          {state === 'denied' ? 'Microphone access was declined — import a file instead.' : level > 0.95 ? 'Too loud — step back a little.' : state === 'rec' && level < 0.02 && t > 2 ? 'We can barely hear you.' : state === 'rec' ? 'Listening…' : state === 'paused' ? 'Paused' : ''}
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          {state === 'rec' || state === 'paused' ? (
            <>
              <Btn variant="ghost" onClick={() => { if (state === 'rec') { mr.current?.pause(); setState('paused') } else { mr.current?.resume(); setState('rec') } navigator.vibrate?.(8) }}>{state === 'rec' ? 'Pause' : 'Resume'}</Btn>
              <button onClick={stop} aria-label="Stop recording" className="grid h-16 w-16 place-items-center rounded-full bg-ruby ring-4 ring-ruby/30"><span className="h-5 w-5 rounded-sm bg-cream" /></button>
            </>
          ) : (
            <button onClick={start} aria-label={source ? 'Record again' : 'Start recording'} className="grid h-16 w-16 place-items-center rounded-full bg-ruby ring-4 ring-ruby/25 transition hover:ring-ruby/50"><span className="h-6 w-6 rounded-full bg-cream" /></button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brass/40 text-sm hover:border-amber-bright">
          Import audio<input type="file" accept="audio/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSource(await decodeToMono(f).catch(() => null)) }} />
        </label>
        <Btn variant="ghost" onClick={() => setSource(demoVoice())}>Use a lullaby</Btn>
      </div>

      {source && url && (
        <div className="mt-5 rounded-2xl border border-ok/30 bg-ok/5 p-4">
          <p className="text-sm"><span className="text-ok">●</span> Source captured · <span className="font-mono">{fmt(source.length / SR)}</span></p>
          <audio src={url} controls className="mt-3 h-9 w-full" />
        </div>
      )}
    </div>
  )
}

function Dedication({ meta, setMeta }: { meta: Record<string, string>; setMeta: (fn: (m: any) => any) => void }) {
  const field = (k: string, label: string, ph = '') => (
    <label className="block">
      <span className="deco text-[10px] text-muted">{label}</span>
      <input value={meta[k]} placeholder={ph} onChange={(e) => setMeta((m: any) => ({ ...m, [k]: e.target.value }))}
        className="mt-1 w-full border-b border-brass/30 bg-transparent py-2 text-cream outline-none placeholder:text-muted/50 focus:border-amber-bright" />
    </label>
  )
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl leading-tight">Who is this voice for?</h2>
      {field('title', 'Memory title', 'The night we met')}
      <div className="grid grid-cols-2 gap-4">{field('recipient', 'For')}{field('sender', 'From')}</div>
      <div>
        <span className="deco text-[10px] text-muted">Occasion</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {OCCASIONS.map((o) => <button key={o} onClick={() => setMeta((m: any) => ({ ...m, occasion: o }))} className={`rounded-full border px-3 py-1.5 text-xs ${meta.occasion === o ? 'border-amber bg-amber/15 text-cream' : 'border-brass/25 text-muted'}`}>{o}</button>)}
        </div>
      </div>
      <label className="block">
        <span className="deco text-[10px] text-muted">Dedication</span>
        <textarea rows={3} value={meta.dedication} onChange={(e) => setMeta((m: any) => ({ ...m, dedication: e.target.value }))} placeholder="What do you want them to remember?"
          className="mt-1 w-full resize-none rounded-xl border border-brass/25 bg-panel p-3 font-display text-lg italic outline-none focus:border-amber-bright" />
      </label>
      <div className="grid grid-cols-3 gap-4">{field('date', 'Date')}{field('sideA', 'Side A')}{field('sideB', 'Side B')}</div>
    </div>
  )
}
