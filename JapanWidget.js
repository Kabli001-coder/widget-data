const DATA_URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/japan.json"

// Load the list; fall back to the last saved copy if offline
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.cacheDirectory(), "claude-japan.json")
let data
try {
  data = await new Request(DATA_URL + "?t=" + Date.now()).loadJSON()
  if (!data.items) throw new Error("bad data")
  fm.writeString(cachePath, JSON.stringify(data))
} catch (e) {
  data = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : { title: "TRIP", date: "2026-11-22", items: [] }
}

const size = config.widgetFamily || "medium"
const DIM = new Color("#ffffff", 0.6)
const WHITE = Color.white()
const RED = new Color("#ff453a")
const GREEN = new Color("#34c759")

// Whole days from today until the trip date (in the phone's own time zone)
const p = String(data.date).split("-").map(Number)
const trip = new Date(p[0], p[1] - 1, p[2])
const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const days = Math.round((trip.getTime() - today.getTime()) / 86400000)

function fmt(date, pattern) {
  const f = new DateFormatter()
  f.dateFormat = pattern
  return f.string(date)
}

// Red ring that fills up over the last 30 days
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
    const path = new Path()
    for (let i = 0; i <= end; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (i / steps)
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a))
      if (i === 0) path.move(pt); else path.addLine(pt)
    }
    dc.addPath(path)
    dc.setStrokeColor(RED)
    dc.strokePath()
  }
  return dc.getImage()
}

function centered(parent, build) {
  const s = parent.addStack()
  s.addSpacer()
  const el = build(s)
  s.addSpacer()
  return el
}

const w = new ListWidget()
const bg = new LinearGradient()
bg.colors = [new Color("#1f5444"), new Color("#0f2f26")]
bg.locations = [0, 1]
w.backgroundGradient = bg
w.setPadding(12, 14, 12, 14)

const root = w.addStack()
root.centerAlignContent()

// ---- Left: countdown ----
const left = root.addStack()
left.layoutVertically()
left.size = new Size(size === "small" ? 0 : 104, 0)

const bigText = days >= 1 ? String(days) : days === 0 ? "Today" : "There"
const unit = days > 1 ? "days to go" : days === 1 ? "day to go" : days === 0 ? "Have a great trip" : "Enjoy Japan"
centered(left, s => {
  const img = s.addImage(ring(84, 9, Math.max(0.03, 1 - days / 30)))
  img.imageSize = new Size(46, 46)
  return img
})
left.addSpacer(4)
centered(left, s => {
  const t = s.addText(bigText)
  t.font = Font.lightSystemFont(days >= 1 ? 34 : 24)
  t.textColor = WHITE
  t.lineLimit = 1
  t.minimumScaleFactor = 0.6
  return t
})
centered(left, s => {
  const t = s.addText(unit)
  t.font = Font.systemFont(10)
  t.textColor = DIM
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
})
left.addSpacer(5)
centered(left, s => {
  const t = s.addText(String(data.title || "TRIP").toUpperCase() + " · " + fmt(trip, "d MMM"))
  t.font = Font.boldSystemFont(10)
  t.textColor = WHITE
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
})

// ---- Right: what you still need ----
if (size !== "small") {
  root.addSpacer(12)
  const line = root.addStack()
  line.backgroundColor = new Color("#ffffff", 0.2)
  line.size = new Size(1, 120)
  root.addSpacer(12)

  const right = root.addStack()
  right.layoutVertically()
  const items = data.items || []
  const doneCount = items.filter(i => i.done).length
  const head = right.addStack()
  const h1 = head.addText("WHAT I NEED")
  h1.font = Font.boldSystemFont(10)
  h1.textColor = DIM
  head.addSpacer()
  const h2 = head.addText(doneCount + "/" + items.length + " done")
  h2.font = Font.systemFont(10)
  h2.textColor = DIM
  right.addSpacer(5)

  // Things still to do first, finished ones after
  const ordered = items.filter(i => !i.done).concat(items.filter(i => i.done))
  const max = size === "large" ? 16 : 6
  for (const it of ordered.slice(0, max)) {
    const r = right.addStack()
    r.centerAlignContent()
    const mark = r.addText(it.done ? "✓" : "○")
    mark.font = Font.boldSystemFont(10)
    mark.textColor = it.done ? GREEN : DIM
    r.addSpacer(6)
    const t = r.addText(String(it.text))
    t.font = Font.systemFont(11.5)
    t.textColor = it.done ? DIM : WHITE
    t.lineLimit = 1
    t.minimumScaleFactor = 0.8
    r.addSpacer()
    right.addSpacer(3)
  }
  const more = ordered.length - max
  if (more > 0) {
    const t = right.addText("+" + more + " more")
    t.font = Font.systemFont(9.5)
    t.textColor = DIM
  }
}

w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentMedium()
Script.complete()
