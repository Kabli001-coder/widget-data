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

const size = config.widgetFamily || "large"
const big = size === "large"
const GREY = new Color("#8fa3bf")
const WHITE = new Color("#e6e9ef")

const w = new ListWidget()
const bg = new LinearGradient()
bg.colors = [new Color("#0d1512"), new Color("#15231d")]
bg.locations = [0, 1]
w.backgroundGradient = bg
w.setPadding(12, 14, 12, 14)

function fmt(date, pattern) {
  const f = new DateFormatter()
  f.dateFormat = pattern
  return f.string(date)
}

function label(text) {
  const t = w.addText(text)
  t.font = Font.heavySystemFont(10)
  t.textColor = GREY
  w.addSpacer(3)
}

function row(tag, tagColor, text, right) {
  const r = w.addStack()
  r.centerAlignContent()
  if (tag) {
    const a = r.addText(tag)
    a.font = Font.boldSystemFont(10)
    a.textColor = new Color(tagColor)
    r.addSpacer(6)
  }
  const b = r.addText(text)
  b.font = Font.systemFont(12)
  b.textColor = WHITE
  b.lineLimit = 1
  b.minimumScaleFactor = 0.8
  if (right) {
    r.addSpacer()
    const c = r.addText(right)
    c.font = Font.systemFont(11)
    c.textColor = GREY
    c.lineLimit = 1
  }
  w.addSpacer(3)
}

if (!data) {
  row("", "#888888", "No data yet. Check your connection.")
} else {
  // FPL deadline countdown: green = plenty of time, yellow = under 3 days, red = under 1 day
  const deadline = new Date(data.deadline.time)
  const mins = Math.floor((deadline.getTime() - Date.now()) / 60000)
  let countdown, color
  if (mins <= 0) { countdown = "LOCKED"; color = "#8e8e93" }
  else if (mins < 24 * 60) { countdown = Math.floor(mins / 60) + "h " + (mins % 60) + "m"; color = "#ff453a" }
  else {
    countdown = Math.floor(mins / 1440) + "d " + Math.floor((mins % 1440) / 60) + "h"
    color = mins < 3 * 1440 ? "#ffd60a" : "#30d158"
  }

  const top = w.addStack()
  top.bottomAlignContent()
  const left = top.addStack()
  left.layoutVertically()
  const l1 = left.addText("FPL GW" + data.deadline.gw + " DEADLINE")
  l1.font = Font.heavySystemFont(10)
  l1.textColor = GREY
  const l2 = left.addText(countdown)
  l2.font = Font.heavySystemFont(big ? 30 : 22)
  l2.textColor = new Color(color)
  top.addSpacer()
  const when = top.addText(fmt(deadline, "EEE d MMM, h:mm a"))
  when.font = Font.systemFont(11)
  when.textColor = GREY
  w.addSpacer(big ? 10 : 5)

  // Liverpool fixtures (upcoming only)
  const games = (data.liverpool || []).filter(g => new Date(g.time).getTime() > Date.now() - 2 * 3600000)
  if (big) label("LIVERPOOL NEXT")
  for (const g of games.slice(0, big ? 4 : 2)) {
    const d = new Date(g.time)
    row(g.comp, "#ff3b30", g.opp + " (" + g.venue + ")", fmt(d, "EEE d MMM, h:mm a"))
  }
  if (big) w.addSpacer(7)

  // Player problems
  if (big) label("PLAYER PROBLEMS")
  for (const p of (data.problems || []).slice(0, big ? 3 : 1)) row(big ? "!" : "OUT", "#ff9f0a", p)
  if (big) w.addSpacer(7)

  // Big games
  if (big) label("BIG GAMES")
  for (const m of (data.big || []).slice(0, big ? 3 : 1)) row(big ? "●" : "BIG", "#30d158", m)
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentLarge()
Script.complete()
