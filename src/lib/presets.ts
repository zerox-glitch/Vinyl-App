export type Preset = {
  id: string; name: string; blurb: string
  warmth: number; age: number; texture: number
  rolloff: number; surfaceDb: number; drive: number; crackles: number; pops: number
  wowDepth: number; wowHz: number; flutterDepth: number; width: number
}

export const PRESETS: Preset[] = [
  { id: 'clean', name: 'Clean Vinyl', blurb: 'A fresh pressing. Your voice, barely touched by time.', warmth: 1, age: 1, texture: 1, rolloff: 16500, surfaceDb: -42, drive: 0.15, crackles: 10, pops: 0.1, wowDepth: 0.0004, wowHz: 0.12, flutterDepth: 0.00004, width: 1 },
  { id: 'warm', name: 'Warm Vintage', blurb: 'Tape warmth and a soft hush, like a Sunday morning.', warmth: 3, age: 2, texture: 2, rolloff: 14200, surfaceDb: -34, drive: 0.35, crackles: 22, pops: 0.4, wowDepth: 0.0007, wowHz: 0.15, flutterDepth: 0.00006, width: 0.9 },
  { id: 'dusty', name: 'Dusty Record', blurb: 'Found in a crate, loved by many hands before yours.', warmth: 3, age: 3, texture: 4, rolloff: 12600, surfaceDb: -28, drive: 0.45, crackles: 38, pops: 1, wowDepth: 0.0009, wowHz: 0.18, flutterDepth: 0.00008, width: 0.8 },
  { id: 'family', name: 'Old Family Record', blurb: 'The one that lived by the radiogram for forty years.', warmth: 4, age: 4, texture: 4, rolloff: 11200, surfaceDb: -26, drive: 0.6, crackles: 42, pops: 1.4, wowDepth: 0.0016, wowHz: 0.09, flutterDepth: 0.0001, width: 0.6 },
  { id: 'archival', name: 'Rare Archival', blurb: 'A voice recovered from another century — still clear.', warmth: 5, age: 5, texture: 5, rolloff: 9800, surfaceDb: -24, drive: 0.7, crackles: 48, pops: 2, wowDepth: 0.0018, wowHz: 0.07, flutterDepth: 0.00012, width: 0.4 },
]

export type VinylStyle = { id: string; name: string; disc: string; label: string; ink: string; sheen: number; opacity: number }
export const STYLES: VinylStyle[] = [
  { id: 'ruby', name: 'Classic Wax Ruby', disc: '#14100e', label: '#991b1b', ink: '#fef3c7', sheen: 0.55, opacity: 1 },
  { id: 'sapphire', name: 'Midnight Sapphire', disc: '#0d1730', label: '#e8dcc0', ink: '#14213d', sheen: 0.7, opacity: 1 },
  { id: 'gold', name: 'Imperial Gold Master', disc: '#a8781f', label: '#0c0a09', ink: '#f59e0b', sheen: 0.9, opacity: 1 },
  { id: 'emerald', name: 'Vintage Emerald', disc: '#0d3b2a', label: '#fff7e6', ink: '#0d3b2a', sheen: 0.6, opacity: 1 },
  { id: 'obsidian', name: 'Smoked Obsidian', disc: '#2a2522', label: '#d97706', ink: '#0c0a09', sheen: 0.8, opacity: 0.78 },
]

export const OCCASIONS = ['Wedding', 'Anniversary', 'Birthday', 'Love Letter', 'Long Distance', 'Family Memory', 'Grandparents', 'Baby', 'Memorial', 'Something Else']
