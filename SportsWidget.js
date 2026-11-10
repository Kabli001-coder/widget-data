const DATA_URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/sports.json"

// Load today's data; fall back to the last saved copy if offline
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.cacheDirectory(), "claude-sports.json")
let data
try {
  data = await new Request(DATA_URL + "?t=" + Date.now()).loadJSON()
  if (!data.deadline) throw new Error("bad data")
  fm.writeString(cachePath, JSON.stringify(data))
} catch (e) {
  data = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null
}

const DIM = new Color("#ffffff", 0.6)
const WHITE = Color.white()
const GREEN = new Color("#34c759")
const AMBER = new Color("#ffcf70")
const W = 364, H = 382, PANEL = 124   // design size; the background scales to the phone

function fmt(date, pattern) {
  const f = new DateFormatter()
  f.dateFormat = pattern
  return f.string(date)
}

// Background: green gradient with a lighter side panel
function background() {
  const dc = new DrawContext()
  dc.size = new Size(W, H)
  dc.opaque = true
  dc.respectScreenScale = true
  const top = [31, 84, 68], bottom = [15, 47, 38], bands = 48
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1)
    const c = top.map((v, k) => Math.round(v + (bottom[k] - v) * t))
    const hex = "#" + c.map(v => v.toString(16).padStart(2, "0")).join("")
    dc.setFillColor(new Color(hex))
    dc.fillRect(new Rect(0, (H / bands) * i, W, H / bands + 1))
  }
  dc.setFillColor(new Color("#ffffff", 0.12))
  dc.fillRect(new Rect(0, 0, PANEL, H))
  dc.setFillColor(new Color("#ffffff", 0.2))
  dc.fillRect(new Rect(PANEL, 0, 1, H))
  return dc.getImage()
}

// Progress ring, like the Batteries widget
function ring(size, line, progress) {
  const dc = new DrawContext()
  dc.size = new Size(size, size)
  dc.opaque = false
  dc.respectScreenScale = true
  dc.setLineWidth(line)
  dc.setStrokeColor(new Color("#ffffff", 0.18))
  dc.strokeEllipse(new Rect(line / 2, line / 2, size - line, size - line))
  if (progress > 0.01) {
    const r = (size - line) / 2, c = size / 2, steps = 72
    const end = Math.max(2, Math.round(steps * Math.min(progress, 1)))
    const p = new Path()
    for (let i = 0; i <= end; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (i / steps)
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a))
      if (i === 0) p.move(pt); else p.addLine(pt)
    }
    dc.addPath(p)
    dc.setStrokeColor(GREEN)
    dc.strokePath()
  }
  return dc.getImage()
}

// Adds one centered element to a vertical stack
function centered(parent, build) {
  const s = parent.addStack()
  s.addSpacer()
  const el = build(s)
  s.addSpacer()
  return el
}

function centeredText(parent, text, font, color) {
  return centered(parent, s => {
    const t = s.addText(text)
    t.font = font
    t.textColor = color
    t.centerAlignText()
    return t
  })
}

function label(parent, text) {
  const t = parent.addText(text)
  t.font = Font.boldSystemFont(10)
  t.textColor = DIM
  parent.addSpacer(4)
}

function item(parent, title, sub) {
  const a = parent.addText(title)
  a.font = Font.semiboldSystemFont(12)
  a.textColor = WHITE
  a.lineLimit = 1
  a.minimumScaleFactor = 0.8
  if (sub) {
    const b = parent.addText(sub)
    b.font = Font.systemFont(10)
    b.textColor = DIM
    b.lineLimit = 1
    b.minimumScaleFactor = 0.8
  }
  parent.addSpacer(5)
}

// Accepts {title, sub} or a plain "Thu 12: England v Croatia" string
function parts(x) {
  if (typeof x !== "string") return x
  const i = x.indexOf(": ")
  return i > 0 ? { title: x.slice(i + 2), sub: x.slice(0, i) } : { title: x, sub: "" }
}

const w = new ListWidget()
w.backgroundImage = background()
w.setPadding(0, 0, 0, 0)

if (!data) {
  w.setPadding(16, 16, 16, 16)
  const t = w.addText("No data yet. Check your connection.")
  t.font = Font.systemFont(13)
  t.textColor = WHITE
} else {
  const root = w.addStack()
  root.topAlignContent()

  // ---- Left panel: FPL countdown + your player problems ----
  const left = root.addStack()
  left.layoutVertically()
  left.size = new Size(112, 0)
  left.setPadding(18, 8, 12, 8)

  const deadline = new Date(data.deadline.time)
  const mins = Math.floor((deadline.getTime() - Date.now()) / 60000)
  const windowMins = 14 * 24 * 60
  const progress = mins <= 0 ? 1 : Math.max(0.03, 1 - mins / windowMins)
  let bigText, smallText
  if (mins <= 0) { bigText = "Locked"; smallText = "" }
  else if (mins < 60) { bigText = mins + "m"; smallText = "" }
  else if (mins < 1440) { bigText = Math.floor(mins / 60) + "h"; smallText = (mins % 60) + "m" }
  else { bigText = Math.floor(mins / 1440) + "d"; smallText = Math.floor((mins % 1440) / 60) + "h" }

  centered(left, s => {
    const img = s.addImage(ring(84, 8, progress))
    img.imageSize = new Size(80, 80)
    return img
  })
  left.addSpacer(8)
  centeredText(left, bigText, Font.lightSystemFont(mins <= 0 ? 22 : 30), WHITE)
  if (smallText) centeredText(left, smallText, Font.lightSystemFont(17), WHITE)
  left.addSpacer(8)
  centeredText(left, "FPL GW" + data.deadline.gw, Font.boldSystemFont(10), DIM)
  left.addSpacer(2)
  centeredText(left, fmt(deadline, "EEE d MMM"), Font.systemFont(10), DIM)
  centeredText(left, fmt(deadline, "h:mm a"), Font.systemFont(10), DIM)
  left.addSpacer(14)
  for (const p of (data.problems || []).slice(0, 3)) {
    const t = centeredText(left, p, Font.systemFont(10), AMBER)
    t.lineLimit = 3
    t.minimumScaleFactor = 0.85
    left.addSpacer(5)
  }

  // ---- Right column: Liverpool, padel, big games ----
  root.addSpacer(12)
  const right = root.addStack()
  right.layoutVertically()
  right.setPadding(15, 4, 10, 12)

  label(right, "LIVERPOOL")
  const games = (data.liverpool || []).filter(g => new Date(g.time).getTime() > Date.now() - 2 * 3600000)
  for (const g of games.slice(0, 2)) {
    item(right, g.opp + " (" + g.venue + ")", g.comp + " · " + fmt(new Date(g.time), "EEE d MMM, h:mm a"))
  }

  const padel = (data.padel || []).map(parts)
  if (padel.length) {
    right.addSpacer(4)
    label(right, "PADEL")
    for (const p of padel.slice(0, 3)) item(right, p.title, p.sub)
  }

  const big = (data.big || []).map(parts)
  if (big.length) {
    right.addSpacer(4)
    label(right, "BIG GAMES")
    for (const b of big.slice(0, padel.length ? 2 : 4)) item(right, b.title, b.sub)
  }
  root.addSpacer()
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentLarge()
Script.complete()
