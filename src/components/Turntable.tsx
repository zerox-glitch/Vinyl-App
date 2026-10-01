import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { VinylStyle } from '../lib/presets'

type Props = {
  style: VinylStyle
  label: { title: string; recipient: string; side: string; date: string }
  engaged: boolean // user wants playback
  progress: number // 0..1
  onContact?: (down: boolean) => void
  resetKey?: number
  className?: string
  playbackRef?: RefObject<HTMLAudioElement | null>
  labelPhoto?: Blob
}

// Tonearm geometry (world units, xz-plane). Pivot P, platter centre C, effective length L (pivot → stylus).
const PIVOT = { x: 1.35, z: -1.0 }, CENTER = { x: -0.45, z: 0 }, ARM_L = 2.2
const R_LEAD_IN = 1.19, R_LEAD_OUT = 0.5, R_REST = 1.62
const DIST = Math.hypot(CENTER.x - PIVOT.x, CENTER.z - PIVOT.z)
const PHI0 = Math.atan2(CENTER.z - PIVOT.z, CENTER.x - PIVOT.x)
/** Stylus heading from pivot for a groove of radius r: intersection of circle(P, L) and circle(C, r) via law of cosines. */
const headingFor = (r: number) => PHI0 - Math.acos(Math.min(1, Math.max(-1, (ARM_L ** 2 + DIST ** 2 - r * r) / (2 * ARM_L * DIST))))
/** three.js Y rotation that turns local −Z into world heading θ (atan2(z, x)). */
const yawFor = (theta: number) => Math.atan2(-Math.cos(theta), -Math.sin(theta))
const armAngle = (r: number) => yawFor(headingFor(r))
const ANG_REST = armAngle(R_REST)
const LIFT_UP = 0.045 // radians of cue-lift about the pivot's horizontal axis

function labelTexture(style: VinylStyle, l: Props['label'], photo?: ImageBitmap) {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = style.label; g.beginPath(); g.arc(256, 256, 256, 0, Math.PI * 2); g.fill()
  if (photo) {
    g.save()
    g.beginPath(); g.arc(256, 256, 228, 0, Math.PI * 2); g.clip()
    const crop = Math.min(photo.width, photo.height)
    g.drawImage(photo, (photo.width - crop) / 2, (photo.height - crop) / 2, crop, crop, 28, 28, 456, 456)
    const shade = g.createLinearGradient(0, 330, 0, 490)
    shade.addColorStop(0, 'transparent'); shade.addColorStop(1, 'rgba(12,10,9,.8)')
    g.fillStyle = shade; g.fillRect(28, 330, 456, 154)
    g.restore()
  }
  g.strokeStyle = style.ink; g.globalAlpha = 0.6
  for (const r of photo ? [240, 228] : [240, 228, 120]) { g.lineWidth = r === 228 ? 1 : 3; g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke() }
  g.globalAlpha = 1; g.fillStyle = style.ink; g.textAlign = 'center'
  const fit = (t: string, max: number) => { let s = t; while (g.measureText(s).width > max && s.length > 1) s = s.slice(0, -2); return s === t ? s : s + '…' }
  if (photo) {
    g.fillStyle = '#fef3c7'
    g.font = '500 24px "Hanken Grotesk"'; g.fillText(fit(l.recipient ? `for ${l.recipient}` : '', 300), 256, 409)
    g.font = '500 18px "DM Mono"'; g.fillText(`SIDE ${l.side.toUpperCase()}`, 256, 442)
  } else {
    g.font = '600 26px "Big Shoulders Display"'; g.fillText('V Y N Y L   R E C O R D', 256, 92)
    g.font = '48px Gloock'; g.fillText(fit(l.title || 'Untitled', 360), 256, 190)
    g.font = '500 24px "Hanken Grotesk"'; g.fillText(fit(l.recipient ? `for ${l.recipient}` : '', 360), 256, 342)
    g.font = '500 20px "DM Mono"'; g.fillText(l.date, 256, 378)
    g.font = '800 30px "Big Shoulders Display"'; g.fillText(l.side.toUpperCase(), 256, 430)
  }
  g.fillStyle = '#0c0a09'; g.beginPath(); g.arc(256, 256, 10, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function grooveTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'; g.fillRect(0, 0, 1024, 1024)
  for (let r = 180; r < 508; r += 1.6) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.18)'
    g.lineWidth = 1; g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke()
  }
  for (const r of [300, 400]) { g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 5; g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke() }
  return new THREE.CanvasTexture(c)
}

export default function Turntable({ style, label, engaged, progress, onContact, resetKey, className, playbackRef, labelPhoto }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ engaged, progress, onContact, playbackRef })
  live.current = { engaged, progress, onContact, playbackRef }
  const api = useRef<{ setStyle: (s: VinylStyle, l: Props['label'], photo?: ImageBitmap) => void; reset: () => void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
    const HOME = new THREE.Vector3(0.2, 3.4, 4.6)
    cam.position.copy(HOME)
    const ctl = new OrbitControls(cam, renderer.domElement)
    ctl.enableDamping = true; ctl.enablePan = false
    ctl.minDistance = 3; ctl.maxDistance = 8; ctl.maxPolarAngle = Math.PI * 0.44; ctl.minPolarAngle = 0.05
    ctl.target.set(0, 0.2, 0)
    ctl.autoRotate = !reduced; ctl.autoRotateSpeed = 0.35

    // lights: warm key, amber fill, cool rim
    scene.add(new THREE.HemisphereLight(0x3a2c20, 0x0c0a09, 0.6))
    const key = new THREE.DirectionalLight(0xffd9a0, 2.6); key.position.set(3, 6, 3); key.castShadow = true
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; key.shadow.radius = 2; Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 }); key.shadow.camera.updateProjectionMatrix()
    const fill = new THREE.PointLight(0xd97706, 8, 12); fill.position.set(-4, 2, 1)
    const rim = new THREE.DirectionalLight(0x8fb3ff, 1.2); rim.position.set(-2, 3, -5)
    scene.add(key, fill, rim)

    const M = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o)
    const lacquer = M({ color: 0x2a1a10, roughness: 0.35, metalness: 0.1 })
    const brass = M({ color: 0xb8862e, roughness: 0.28, metalness: 1 })
    const steel = M({ color: 0xc9c4bd, roughness: 0.3, metalness: 1 })
    const rubber = M({ color: 0x141210, roughness: 0.95 })
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o
    }

    // floor contact shadow
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.45 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.36; floor.receiveShadow = true; scene.add(floor)

    // plinth (beveled box via extruded rounded rect)
    const shape = new THREE.Shape(); const w = 2.1, d = 1.6, r = 0.14
    shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r); shape.lineTo(w, d - r)
    shape.quadraticCurveTo(w, d, w - r, d); shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d)
    const plinthG = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 })
    plinthG.rotateX(-Math.PI / 2); plinthG.translate(0, -0.3, 0)
    scene.add(mesh(plinthG, lacquer))
    const trim = mesh(new THREE.BoxGeometry(4.24, 0.02, 3.24), brass, 0, 0.075, 0); scene.add(trim)
    for (const [x, z] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]]) scene.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 24), rubber, x, -0.33, z))

    // platter + mat
    const PX = -0.45
    const platter = new THREE.Group(); platter.position.set(PX, 0.1, 0); scene.add(platter)
    platter.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 96), steel, 0, 0, 0))
    platter.add(mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.02, 96), rubber, 0, 0.07, 0))
    for (let i = 0; i < 60; i++) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.02), M({ color: 0xe6e0d8, metalness: 1, roughness: 0.2 }))
      const a = (i / 60) * Math.PI * 2; dot.position.set(Math.cos(a) * 1.355, 0, Math.sin(a) * 1.355); dot.rotation.y = -a; platter.add(dot)
    }
    // record
    const record = new THREE.Group(); platter.add(record)
    const discMat = M({ color: style.disc, roughness: 0.25, metalness: 0.3, bumpMap: grooveTexture(), bumpScale: 0.6, transparent: true, opacity: style.opacity })
    const disc = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.025, 128), discMat, 0, 0.095, 0); record.add(disc)
    const labelMat = M({ map: labelTexture(style, label), roughness: 0.8 })
    const lab = mesh(new THREE.CircleGeometry(0.42, 64), labelMat, 0, 0.109, 0); lab.rotation.x = -Math.PI / 2; record.add(lab)
    record.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 16), steel, 0, 0.14, 0))

    // tonearm — pivot frame: arm points along local −Z, stylus tip at (0, −0.1125, −L) which sits exactly on the record surface
    const arm = new THREE.Group(); arm.position.set(PIVOT.x, 0.1, PIVOT.z); scene.add(arm)
    arm.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 40), brass, 0, 0, 0))
    const pivot = new THREE.Group(); pivot.position.y = 0.22; arm.add(pivot)
    pivot.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 20), steel, 0, -0.1, 0))
    const lift = new THREE.Group(); pivot.add(lift)
    lift.add(mesh(new THREE.SphereGeometry(0.075, 24, 16), steel))
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.42), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.09, 0, -ARM_L * 0.45), new THREE.Vector3(0.02, -0.01, -ARM_L + 0.32), new THREE.Vector3(0, -0.03, -ARM_L + 0.16)])
    lift.add(mesh(new THREE.TubeGeometry(curve, 96, 0.024, 12), steel))
    lift.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 32).rotateX(Math.PI / 2), brass, 0, 0, 0.5))
    // headshell yawed by the offset angle so the cartridge is tangent to the groove at mid-record
    const rMid = (R_LEAD_IN + R_LEAD_OUT) / 2, th = headingFor(rMid)
    const sx = PIVOT.x + Math.cos(th) * ARM_L - CENTER.x, sz = PIVOT.z + Math.sin(th) * ARM_L - CENTER.z
    let offset = yawFor(Math.atan2(sx, -sz)) - yawFor(th)
    offset = Math.atan2(Math.sin(offset), Math.cos(offset)); if (offset > Math.PI / 2) offset -= Math.PI; if (offset < -Math.PI / 2) offset += Math.PI
    const shell = new THREE.Group(); shell.position.set(0, 0, -ARM_L); shell.rotation.y = offset; lift.add(shell)
    shell.add(mesh(new THREE.BoxGeometry(0.15, 0.03, 0.3), M({ color: 0x1a1614, roughness: 0.4 }), 0, -0.035, 0.06))
    shell.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), brass, 0, -0.07, 0.01))
    const needle = mesh(new THREE.ConeGeometry(0.008, 0.02, 8), steel, 0, -0.1025, 0); needle.rotation.x = Math.PI; shell.add(needle)
    shell.add(mesh(new THREE.BoxGeometry(0.02, 0.012, 0.1), brass, 0.09, -0.03, 0.14)) // finger lift
    // arm rest post under the parked tube
    const restTh = headingFor(R_REST)
    scene.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 16), steel, PIVOT.x + Math.cos(restTh) * 1.3, 0.17, PIVOT.z + Math.sin(restTh) * 1.3))
    // controls: start knob + light
    const knob = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 32), brass, -1.75, 0.1, 1.25); scene.add(knob)
    const speed = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 24), steel, -1.35, 0.1, 1.3); scene.add(speed)
    const lampMat = M({ color: 0x3a1a0a, emissive: 0xf59e0b, emissiveIntensity: 0 })
    scene.add(mesh(new THREE.SphereGeometry(0.04, 16, 16), lampMat, -1.05, 0.12, 1.32))

    // armSweep: angle from rest (outside) to groove; positive rotates over record
    const st = { spin: 0, rot: 0, ang: ANG_REST, vel: 0, lift: LIFT_UP, down: false, settle: 1 }
    const cue = { phase: 'parked' as 'parked' | 'lifting' | 'swinging' | 'lowering' | 'tracking' | 'returning', audioTime: 0 }
    api.current = {
      setStyle(s, l, photo) {
        discMat.color.set(s.disc); discMat.opacity = s.opacity; discMat.roughness = 1 - s.sheen * 0.8
        labelMat.map?.dispose(); labelMat.map = labelTexture(s, l, photo); labelMat.needsUpdate = true
        if (!playbackRef) st.settle = 0
      },
      reset() { cam.position.copy(HOME); ctl.target.set(0, 0.2, 0) },
    }

    const resize = () => { const { clientWidth: w, clientHeight: h } = el; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix() }
    resize(); const ro = new ResizeObserver(resize); ro.observe(el)
    let last = performance.now(), raf = 0, visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting)); io.observe(el)
    ctl.addEventListener('start', () => (ctl.autoRotate = false))

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (!visible) return
      const { engaged: on, progress, onContact: cb, playbackRef } = live.current
      const media = playbackRef?.current
      const pr = media && Number.isFinite(media.duration) && media.duration > 0 ? media.currentTime / media.duration : progress
      // platter physics
      const targetSpin = on ? (33.333 / 60) * Math.PI * 2 : 0
      st.spin += (targetSpin - st.spin) * Math.min(1, dt * (on ? 1.6 : 0.9))
      st.rot += st.spin * dt; platter.rotation.y = -st.rot
      // record settle
      st.settle = Math.min(1, st.settle + dt * 1.5)
      record.position.y = (1 - st.settle) ** 2 * 0.5
      // tonearm physics: cue up → spring-damped lateral swing → viscous cue-down → groove-driven tracking
      const spunUp = on && st.spin > targetSpin * 0.9
      const grooveR = R_LEAD_IN - (R_LEAD_IN - R_LEAD_OUT) * Math.min(1, Math.max(0, pr))
      const grooveAng = armAngle(grooveR)
      if (playbackRef) {
        const seeked = media ? Math.abs(media.currentTime - cue.audioTime) > dt + 0.15 : false
        cue.audioTime = media?.currentTime ?? 0
        if ((on && cue.phase === 'parked') || (!on && cue.phase !== 'parked' && cue.phase !== 'lifting' && cue.phase !== 'returning') || (on && cue.phase === 'returning') || (cue.phase === 'tracking' && (seeked || media?.seeking))) {
          cue.phase = 'lifting'
          st.vel = 0
          if (st.down) { st.down = false; cb?.(false) }
        }
        if (cue.phase === 'lifting') {
          st.lift += (LIFT_UP - st.lift) * (1 - Math.exp(-dt * 12))
          if (LIFT_UP - st.lift < 0.0002) {
            st.lift = LIFT_UP
            cue.phase = on ? 'swinging' : 'returning'
          }
        }
        if (cue.phase === 'swinging' || cue.phase === 'returning') {
          const target = on ? grooveAng : ANG_REST
          const steps = Math.max(1, Math.ceil(dt / 0.004)), step = dt / steps
          for (let index = 0; index < steps; index++) {
            const delta = Math.atan2(Math.sin(target - st.ang), Math.cos(target - st.ang))
            st.vel += (36 * delta - 12 * st.vel) * step
            st.ang += st.vel * step
          }
          if (Math.abs(target - st.ang) < 0.0005 && Math.abs(st.vel) < 0.003) {
            st.ang = target
            st.vel = 0
            if (!on) cue.phase = 'parked'
            else if (spunUp && st.settle === 1) cue.phase = 'lowering'
          }
        }
        if (cue.phase === 'lowering') {
          if (Math.abs(grooveAng - st.ang) > 0.002 || st.settle < 1) cue.phase = 'lifting'
          else {
            st.ang = grooveAng
            st.lift *= Math.exp(-dt * 3.5)
            if (st.lift < 0.00008) {
              st.lift = 0
              st.down = true
              cue.phase = 'tracking'
              cb?.(true)
              navigator.vibrate?.(6)
            }
          }
        }
        if (cue.phase === 'tracking') {
          st.ang = grooveAng
          st.lift = 0
          st.vel = 0
        }
      } else {
        if (st.down) {
          // the groove drags the stylus inward; record eccentricity adds a tiny once-per-revolution sway
          if (!on || Math.abs(grooveAng - st.ang) > 0.02) { st.down = false; cb?.(false) } // stop or seek ⇒ cue up
          else { st.ang = grooveAng + Math.sin(st.rot) * 0.0012; st.vel = 0; st.lift = 0 }
        }
        if (!st.down) {
          const want = spunUp ? grooveAng : on ? armAngle(R_LEAD_IN + 0.1) : ANG_REST
          const raised = st.lift > LIFT_UP * 0.9
          const settled = Math.abs(want - st.ang) < 0.003 && Math.abs(st.vel) < 0.01
          const lower = spunUp && settled
          // cue lever: quick lift, slow silicone-damped descent
          st.lift += ((lower ? 0 : LIFT_UP) - st.lift) * Math.min(1, dt * (lower ? 1.8 : 7))
          // only swing laterally once the stylus is clear of the vinyl; critically damped spring (k, c = 2√k)
          if (raised || !lower) {
            const k = 14, c = 2 * Math.sqrt(k) * 1.05
            const steps = Math.ceil(dt / 0.004), h = dt / steps
            for (let i = 0; i < steps; i++) { st.vel += (k * (raised ? want - st.ang : 0) - c * st.vel) * h; st.ang += st.vel * h }
          }
          if (lower && st.lift < 0.0015) { st.lift = 0; st.down = true; cb?.(true); navigator.vibrate?.(6) }
        }
      }
      pivot.rotation.y = st.ang
      lift.rotation.x = st.lift + (!playbackRef && st.down ? Math.sin(now * 0.047) * 0.00025 : 0)
      knob.position.y = on ? 0.085 : 0.1
      speed.rotation.y = on ? 0.6 : 0
      lampMat.emissiveIntensity += ((on ? 2.2 : 0.15) - lampMat.emissiveIntensity) * dt * 4
      ctl.update(); renderer.render(scene, cam)
    }
    raf = requestAnimationFrame(loop)
    const dbl = () => api.current?.reset()
    renderer.domElement.addEventListener('dblclick', dbl)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); ctl.dispose()
      scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
      labelMat.map?.dispose()
      renderer.dispose(); el.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!labelPhoto) { api.current?.setStyle(style, label); return }
    let cancelled = false
    createImageBitmap(labelPhoto).then((photo) => {
      if (!cancelled) api.current?.setStyle(style, label, photo)
      photo.close()
    }).catch(() => { if (!cancelled) api.current?.setStyle(style, label) })
    return () => { cancelled = true }
  }, [style, label.title, label.recipient, label.side, label.date, labelPhoto])
  useEffect(() => { if (resetKey) api.current?.reset() }, [resetKey])

  return <div ref={host} className={className} role="img" aria-label={`3D turntable with ${style.name} record${labelPhoto ? ' and a loved-one photo on its label' : ''}`} />
}
