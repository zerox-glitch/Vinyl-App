import type { Preset } from './presets'

export const SR = 44100

/** mulberry32 seeded from a string — same record + preset ⇒ same crackle positions */
export function rng(seedStr: string) {
  let h = 1779033703
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19))
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; z1 = 0; z2 = 0
  static make(type: 'lp' | 'hp' | 'peak', f: number, q = 0.707, gainDb = 0) {
    const k = new Biquad(), w = (2 * Math.PI * f) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q)
    let b0, b1, b2, a0, a1, a2
    if (type === 'peak') {
      const A = Math.pow(10, gainDb / 40)
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A
    } else {
      const lp = type === 'lp'
      b1 = lp ? 1 - cs : -(1 + cs); b0 = b2 = lp ? b1 / 2 : -b1 / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al
    }
    Object.assign(k, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 })
    return k
  }
  run(x: number) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

export type RenderOpts = { preset: Preset; seed: string; music?: Float32Array | null; musicLevel: number; onProgress?: (p: number, stage: string) => void }

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Full vinyl pipeline on mono 44.1k voice → stereo master. Processes in blocks and yields to keep UI alive. */
export async function renderMaster(voice: Float32Array, o: RenderOpts): Promise<[Float32Array, Float32Array]> {
  const p = o.preset, R = rng(o.seed + ':' + p.id), intro = Math.floor(SR * 1.2)
  const n = voice.length + intro + SR, L = new Float32Array(n), Rt = new Float32Array(n)
  const hp = Biquad.make('hp', 80), pres = Biquad.make('peak', 3200, 0.9, 2.5), warm = Biquad.make('peak', 220, 0.8, p.warmth * 0.8)
  const lpA = Biquad.make('lp', p.rolloff), lpB = Biquad.make('lp', p.rolloff * 1.05)
  const nLp = Biquad.make('lp', p.rolloff * 0.6), nHp = Biquad.make('hp', 300), rumble = Biquad.make('lp', 40)
  const delay = new Float32Array(4096); let wi = 0
  let env = 0, duck = 0, pink = [0, 0, 0], drift = 0
  const thr = 0.25, ratio = 3, atk = Math.exp(-1 / (SR * 0.005)), rel = Math.exp(-1 / (SR * 0.12))
  const surf = Math.pow(10, p.surfaceDb / 20), crackP = p.crackles / 60 / SR, popP = p.pops / 60 / SR
  const ev: { t: number; amp: number; len: number; pan: number; f: number }[] = []
  const block = 8192
  for (let s = 0; s < n; s += block) {
    const end = Math.min(n, s + block)
    for (let i = s; i < end; i++) {
      const vi = i - intro
      let v = vi >= 0 && vi < voice.length ? voice[vi] : 0
      // voice cleanup + warmth
      v = warm.run(pres.run(hp.run(v)))
      // background with voice-controlled ducking
      const lev = Math.abs(v); duck = lev > duck ? duck + (lev - duck) * 0.01 : duck * 0.99995
      if (o.music && o.music.length && vi >= 0) v += o.music[vi % o.music.length] * o.musicLevel * (1 - Math.min(0.75, duck * 6))
      // saturation
      const d = 1 + p.drive * 4
      v = (1 - p.drive) * v + p.drive * (Math.tanh(v * d) / Math.tanh(d))
      // compressor (soft knee approx)
      const a = Math.abs(v); env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a
      if (env > thr) v *= Math.pow(env / thr, 1 / ratio - 1)
      v *= 1.4
      // wow + flutter via interpolated delay
      delay[wi] = v
      const t = i / SR
      const mod = 600 + SR * (p.wowDepth * Math.sin(2 * Math.PI * p.wowHz * t + 0.3 * Math.sin(t * 0.21)) + p.flutterDepth * Math.sin(2 * Math.PI * 42 * t))
      const rp = wi - mod, ip = Math.floor(rp), fr = rp - ip
      const x0 = delay[(ip + 4096) & 4095], x1 = delay[(ip + 4097) & 4095]
      v = x0 + (x1 - x0) * fr
      wi = (wi + 1) & 4095
      // surface noise (pink-ish, slowly breathing)
      const w = R() * 2 - 1
      pink[0] = 0.997 * pink[0] + w * 0.029; pink[1] = 0.985 * pink[1] + w * 0.032; pink[2] = 0.95 * pink[2] + w * 0.048
      drift += (R() - 0.5) * 0.0004; drift *= 0.9999
      const noise = nHp.run(nLp.run(pink[0] + pink[1] + pink[2] + w * 0.02)) * surf * (1 + drift * 8) * 3 + rumble.run(R() - 0.5) * surf * 2
      // crackle (Poisson, clustered) & pops
      if (R() < crackP * (ev.length ? 2.5 : 1)) ev.push({ t: 0, amp: (0.02 + R() * 0.06) * (p.texture / 3), len: 4 + R() * 30, pan: R(), f: 0 })
      if (R() < popP) ev.push({ t: 0, amp: 0.12 + R() * 0.08, len: 180 + R() * 200, pan: 0.3 + R() * 0.4, f: 1 })
      let cl = 0, cr = 0
      for (let k = ev.length - 1; k >= 0; k--) {
        const e = ev[k], dec = Math.exp(-e.t / (e.len * 0.3))
        const sig = e.f ? Math.sin(e.t * 0.09) * dec * e.amp : (R() * 2 - 1) * dec * e.amp
        cl += sig * (1 - e.pan); cr += sig * e.pan
        if (++e.t > e.len) ev.splice(k, 1)
      }
      // eq rolloff per channel, stereo width
      const fade = Math.min(1, i / (SR * 0.4), (n - i) / (SR * 0.6))
      const vl = lpA.run(v), vr = lpB.run(v)
      const mid = (vl + vr) / 2, side = ((vl - vr) / 2) * p.width
      L[i] = (mid + side + noise + cl * 2) * fade
      Rt[i] = (mid - side + noise * 0.92 + cr * 2) * fade
    }
    o.onProgress?.(s / n, s / n < 0.3 ? 'Mixing atmosphere' : s / n < 0.8 ? 'Adding vinyl character' : 'Mastering')
    await tick()
  }
  // limiter: normalize to -1 dBFS then soft ceiling
  let peak = 1e-6
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]))
  const g = 0.891 / peak
  for (let i = 0; i < n; i++) {
    L[i] = Number.isFinite(L[i]) ? L[i] * g : 0
    Rt[i] = Number.isFinite(Rt[i]) ? Rt[i] * g : 0
  }
  return [L, Rt]
}

export function encodeWav(l: Float32Array, r: Float32Array) {
  const n = l.length, buf = new ArrayBuffer(44 + n * 4), d = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ')
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, SR, true)
  d.setUint32(28, SR * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 4, true)
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    d.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 32767, true)
    d.setInt16(o + 2, Math.max(-1, Math.min(1, r[i])) * 32767, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export async function decodeToMono(blob: Blob): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, SR)
  const ab = await ctx.decodeAudioData(await blob.arrayBuffer())
  const off = new OfflineAudioContext(1, Math.ceil(ab.duration * SR), SR)
  const src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start()
  return (await off.startRendering()).getChannelData(0)
}

export function waveform(data: Float32Array, bars = 72) {
  const step = Math.floor(data.length / bars) || 1, out: number[] = []
  for (let b = 0; b < bars; b++) {
    let m = 0
    for (let i = b * step; i < (b + 1) * step && i < data.length; i += 32) m = Math.max(m, Math.abs(data[i]))
    out.push(m)
  }
  const mx = Math.max(...out, 1e-6)
  return out.map((v) => v / mx)
}

/** A synthesized music-box lullaby so the prototype has something to press without a mic. */
export function demoVoice(): Float32Array {
  const notes = [0, 4, 7, 12, 11, 7, 9, 5, 4, 2, 0, -1, 0, 4, 7, 4]
  const len = SR * 9, out = new Float32Array(len), beat = len / notes.length
  notes.forEach((nt, k) => {
    const f = 392 * Math.pow(2, nt / 12), st = Math.floor(k * beat)
    for (let i = 0; i < SR * 1.4 && st + i < len; i++) {
      const t = i / SR, e = Math.exp(-t * 3)
      out[st + i] += 0.3 * e * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t))
    }
  })
  return out
}

/** Gentle pad bed used as the bundled background option. */
export function demoPad(): Float32Array {
  const len = SR * 8, out = new Float32Array(len), ch = [130.8, 164.8, 196, 246.9]
  for (let i = 0; i < len; i++) {
    const t = i / SR, sw = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 8 - Math.PI / 2)
    let s = 0
    for (const f of ch) s += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.7))
    out[i] = s * 0.06 * (0.6 + 0.4 * sw)
  }
  return out
}
