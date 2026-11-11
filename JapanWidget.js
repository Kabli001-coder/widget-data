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
  data = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : { title: "JAPAN", date: "2026-11-22", items: [] }
}

const size = config.widgetFamily || "medium"
const DIM = new Color("#ffffff", 0.6)
const WHITE = Color.white()
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

// Boarding-pass background: green gradient, lighter stub on the right,
// a dashed tear line and two notches
const W = 364, H = size === "large" ? 382 : 170, STUB = 104
function ticket() {
  const dc = new DrawContext()
  dc.size = new Size(W, H)
  dc.opaque = true
  dc.respectScreenScale = true
  const top = [31, 84, 68], bottom = [15, 47, 38], bands = 40
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1)
    const c = top.map((v, k) => Math.round(v + (bottom[k] - v) * t))
    dc.setFillColor(new Color("#" + c.map(v => v.toString(16).padStart(2, "0")).join("")))
    dc.fillRect(new Rect(0, (H / bands) * i, W, H / bands + 1))
  }
  const x = W - STUB
  dc.setFillColor(new Color("#ffffff", 0.12))
  dc.fillRect(new Rect(x, 0, STUB, H))
  dc.setFillColor(new Color("#ffffff", 0.4))
  for (let y = 14; y < H - 14; y += 9) dc.fillRect(new Rect(x - 1, y, 2, 5))
  dc.setFillColor(new Color("#0b241d"))
  dc.fillEllipse(new Rect(x - 10, -10, 20, 20))
  dc.fillEllipse(new Rect(x - 10, H - 10, 20, 20))
  return dc.getImage()
}

function centered(parent, text, font, color) {
  const s = parent.addStack()
  s.addSpacer()
  const t = s.addText(text)
  t.font = font
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.6
  s.addSpacer()
  return t
}

const w = new ListWidget()
const bigText = days >= 1 ? String(days) : days === 0 ? "Today" : "There"
const unit = days > 1 ? "days" : days === 1 ? "day" : days === 0 ? "Safe travels" : "Enjoy Japan"
const stubLabel = days >= 1 ? "DEPARTS IN" : String(data.title || "TRIP").toUpperCase()

if (size === "small") {
  // Small size: just the countdown
  const bg = new LinearGradient()
  bg.colors = [new Color("#1f5444"), new Color("#0f2f26")]
  bg.locations = [0, 1]
  w.backgroundGradient = bg
  w.addSpacer()
  centered(w, String(data.title || "TRIP").toUpperCase() + " · " + fmt(trip, "d MMM"), Font.boldSystemFont(10), DIM)
  centered(w, bigText, Font.lightSystemFont(days >= 1 ? 48 : 26), WHITE)
  centered(w, unit, Font.systemFont(12), WHITE)
  w.addSpacer()
} else {
  w.backgroundImage = ticket()
  w.setPadding(0, 0, 0, 0)
  const root = w.addStack()
  root.centerAlignContent()

  // ---- Main part: date and what you still need ----
  const main = root.addStack()
  main.layoutVertically()
  main.setPadding(12, 16, 10, 6)

  const items = data.items || []
  const doneCount = items.filter(i => i.done).length
  const head = main.addStack()
  const h1 = head.addText("TRIP TO " + String(data.title || "JAPAN").toUpperCase())
  h1.font = Font.boldSystemFont(10)
  h1.textColor = DIM
  head.addSpacer()
  const h2 = head.addText(doneCount + "/" + items.length + " ready")
  h2.font = Font.systemFont(10)
  h2.textColor = DIM
  main.addSpacer(1)
  const d = main.addText(fmt(trip, "EEE d MMM"))
  d.font = Font.lightSystemFont(20)
  d.textColor = WHITE
  main.addSpacer(4)

  // Things still to do first, finished ones after
  const ordered = items.filter(i => !i.done).concat(items.filter(i => i.done))
  const max = size === "large" ? 16 : 5
  for (const it of ordered.slice(0, max)) {
    const r = main.addStack()
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
    main.addSpacer(3)
  }
  if (!items.length) {
    const t = main.addText("Nothing on the list yet")
    t.font = Font.systemFont(11.5)
    t.textColor = DIM
  }

  // ---- Stub: countdown ----
  root.addSpacer(8)
  const stub = root.addStack()
  stub.layoutVertically()
  stub.size = new Size(92, 0)
  centered(stub, stubLabel, Font.boldSystemFont(9.5), DIM)
  stub.addSpacer(2)
  centered(stub, bigText, Font.lightSystemFont(days >= 1 ? 42 : 22), WHITE)
  centered(stub, unit, Font.systemFont(11), WHITE)
  root.addSpacer(6)
}

w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentMedium()
Script.complete()
