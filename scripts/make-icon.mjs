/**
 * Generates the app icon.
 *
 *   node scripts/make-icon.mjs
 *
 * ## Why the icon is drawn in code
 *
 * The mark is three streaming text bars, and its colours are the *same* OKLCH
 * values the UI theme is built from (`src/lib/theme.ts`, `slate` colorway). Drawing
 * it here rather than committing a binary means the icon and the interface can't
 * drift apart: change the accent and re-run, and the dock icon follows.
 *
 * It also keeps the repo dependency-free. A rounded rectangle and four bars need a
 * rasteriser about forty lines long — not an image toolchain.
 *
 * Outputs `build/icon.png` (1024²) plus `build/icon.icns` on macOS, which is what
 * electron-builder picks up by convention from `build/`.
 */
import { deflateSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const SIZE = 1024

// ---------------------------------------------------------------------------
// OKLCH -> sRGB. Mirrors what the browser does for the `oklch()` values in
// src/lib/theme.ts, so the icon is literally the same colour as the accent.
// ---------------------------------------------------------------------------

function oklchToRgb(l, c, hDegrees) {
  const h = (hDegrees * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]

  return lin.map((value) => {
    const clamped = Math.min(1, Math.max(0, value))
    const encoded =
      clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
    return Math.round(encoded * 255)
  })
}

// The `slate` colorway: accent, and a dark base a little deeper than --bg so the
// icon reads as its own object rather than a hole in the dock.
const ACCENT = oklchToRgb(0.7, 0.115, 250)
const ACCENT_DIM = oklchToRgb(0.58, 0.105, 255)
const BASE_TOP = oklchToRgb(0.28, 0.012, 265)
const BASE_BOTTOM = oklchToRgb(0.185, 0.008, 265)

// ---------------------------------------------------------------------------
// Rasteriser
// ---------------------------------------------------------------------------

const pixels = new Uint8Array(SIZE * SIZE * 4)

/** Alpha-blend a colour into one pixel. `alpha` is 0..1. */
function blend(x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  const existing = pixels[i + 3] / 255
  const out = alpha + existing * (1 - alpha)
  if (out === 0) return
  for (let channel = 0; channel < 3; channel += 1) {
    const source = channel === 0 ? r : channel === 1 ? g : b
    pixels[i + channel] = Math.round(
      (source * alpha + pixels[i + channel] * existing * (1 - alpha)) / out,
    )
  }
  pixels[i + 3] = Math.round(out * 255)
}

/**
 * Signed distance to a rounded rectangle, negative inside. Anti-aliasing is a
 * 1px ramp across that distance — cheap, and the only reason the curves don't
 * look like stairs at 32px.
 */
function roundedRectCoverage(x, y, rect) {
  const dx = Math.max(rect.x - x, x - (rect.x + rect.w), 0)
  const dy = Math.max(rect.y - y, y - (rect.y + rect.h), 0)
  const outside = Math.hypot(dx, dy)

  const insetX = Math.min(x - rect.x, rect.x + rect.w - x)
  const insetY = Math.min(y - rect.y, rect.y + rect.h - y)
  const corner = rect.r

  let distance
  if (insetX >= corner || insetY >= corner) {
    distance = outside > 0 ? outside : -Math.min(insetX, insetY)
  } else {
    const cx = insetX < corner ? corner - insetX : 0
    const cy = insetY < corner ? corner - insetY : 0
    distance = Math.hypot(cx, cy) - corner
  }
  return Math.min(1, Math.max(0, 0.5 - distance))
}

function fillRoundedRect(rect, colorAt) {
  const x0 = Math.max(0, Math.floor(rect.x - 2))
  const x1 = Math.min(SIZE, Math.ceil(rect.x + rect.w + 2))
  const y0 = Math.max(0, Math.floor(rect.y - 2))
  const y1 = Math.min(SIZE, Math.ceil(rect.y + rect.h + 2))

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const coverage = roundedRectCoverage(x + 0.5, y + 0.5, rect)
      if (coverage > 0) blend(x, y, colorAt(x, y), coverage)
    }
  }
}

// Base: macOS "squircle" proportions — radius ≈ 22.4% of the side.
const PAD = SIZE * 0.08
const base = { x: PAD, y: PAD, w: SIZE - PAD * 2, h: SIZE - PAD * 2, r: SIZE * 0.224 }
fillRoundedRect(base, (_x, y) => {
  const t = (y - base.y) / base.h
  return BASE_TOP.map((top, i) => Math.round(top + (BASE_BOTTOM[i] - top) * t))
})

/*
 * The mark: three bars of decreasing width, plus a caret at the end of the last
 * one — a paragraph mid-stream, which is what the app is for. Decreasing width is
 * what makes it read as text rather than as a menu icon.
 */
const barHeight = SIZE * 0.088
const gap = SIZE * 0.062
const left = SIZE * 0.245
const top = SIZE * 0.335
const widths = [0.51, 0.4, 0.27]

widths.forEach((width, index) => {
  fillRoundedRect(
    {
      x: left,
      y: top + index * (barHeight + gap),
      w: SIZE * width,
      h: barHeight,
      r: barHeight / 2,
    },
    () => (index === 0 ? ACCENT : ACCENT_DIM),
  )
})

// The caret sits at the live edge of the shortest bar.
fillRoundedRect(
  {
    x: left + SIZE * widths[2] + SIZE * 0.045,
    y: top + 2 * (barHeight + gap),
    w: barHeight * 0.72,
    h: barHeight,
    r: barHeight * 0.3,
  },
  () => ACCENT,
)

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte (0 = None) per scanline. Filtering would compress better; at
  // 1024² the file is already ~30KB, and None keeps this readable.
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.mkdirSync(BUILD, { recursive: true })
const png = encodePng(SIZE, SIZE, pixels)

const pngPath = path.join(BUILD, 'icon.png')
fs.writeFileSync(pngPath, png)
console.log(`wrote ${path.relative(ROOT, pngPath)} (${SIZE}x${SIZE})`)

// The renderer's favicon — the tab/taskbar image, distinct from the dock icon.
// Written from the same buffer so the two can never disagree.
const publicDir = path.join(ROOT, 'public')
fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(path.join(publicDir, 'icon.png'), png)
console.log('wrote public/icon.png')

// macOS wants a multi-resolution .icns. `sips` and `iconutil` ship with the OS, so
// this needs nothing installed; elsewhere the PNG alone is enough for the window
// icon and electron-builder.
if (process.platform === 'darwin') {
  const iconset = path.join(BUILD, 'icon.iconset')
  fs.rmSync(iconset, { recursive: true, force: true })
  fs.mkdirSync(iconset)

  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    for (const [suffix, scale] of [
      [`${size}x${size}`, 1],
      [`${size / 2}x${size / 2}@2x`, 2],
    ]) {
      if (scale === 2 && size < 32) continue
      execFileSync('sips', [
        '-z',
        String(size),
        String(size),
        pngPath,
        '--out',
        path.join(iconset, `icon_${suffix}.png`),
      ])
    }
  }

  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(BUILD, 'icon.icns')])
  fs.rmSync(iconset, { recursive: true, force: true })
  console.log('wrote build/icon.icns')
}
