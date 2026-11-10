const DATA_URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/news.json"

// Load the latest data; fall back to the last saved copy if offline
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.cacheDirectory(), "claude-widget.json")
let data
try {
  data = await new Request(DATA_URL + "?t=" + Date.now()).loadJSON()
  if (!data.items) throw new Error("bad data")
  fm.writeString(cachePath, JSON.stringify(data))
} catch (e) {
  if (fm.fileExists(cachePath)) {
    data = JSON.parse(fm.readString(cachePath))
  } else {
    data = { updated: "", items: [{ tag: "Offline", color: "#8e8e93", text: "No data yet. Check your connection." }] }
  }
}

const size = config.widgetFamily || "medium"
const DIM = new Color("#ffffff", 0.6)
const WHITE = Color.white()

const w = new ListWidget()
const bg = new LinearGradient()
bg.colors = [new Color("#1f5444"), new Color("#0f2f26")]
bg.locations = [0, 1]
w.backgroundGradient = bg
w.setPadding(13, 15, 12, 15)

// Small rounded label in the topic's color
function pill(parent, item) {
  const p = parent.addStack()
  p.backgroundColor = new Color(item.color || "#ffffff", 0.22)
  p.cornerRadius = 5
  p.setPadding(2, 6, 2, 6)
  const t = p.addText(String(item.tag).toUpperCase())
  t.font = Font.boldSystemFont(9)
  t.textColor = new Color(item.color || "#ffffff")
  t.lineLimit = 1
  return p
}

// Header
const head = w.addStack()
head.centerAlignContent()
const title = head.addText("TECH TODAY")
title.font = Font.boldSystemFont(10)
title.textColor = DIM
head.addSpacer()
const date = head.addText(data.updated || "")
date.font = Font.systemFont(10)
date.textColor = DIM
w.addSpacer(7)

const items = data.items || []
const lead = items[0]
const restCount = size === "small" ? 0 : size === "large" ? 6 : 3

// Lead story: label on top, headline below
if (lead) {
  const box = w.addStack()
  box.layoutVertically()
  if (lead.url) box.url = lead.url
  pill(box, lead)
  box.addSpacer(4)
  const t = box.addText(String(lead.text))
  t.font = Font.semiboldSystemFont(size === "small" ? 12 : 14)
  t.textColor = WHITE
  t.lineLimit = size === "small" ? 5 : 2
  t.minimumScaleFactor = 0.85
}

// Thin divider
if (restCount && items.length > 1) {
  w.addSpacer(7)
  const line = w.addStack()
  line.backgroundColor = new Color("#ffffff", 0.18)
  line.size = new Size(0, 1)
  line.addSpacer()
  w.addSpacer(6)
}

// Other stories: colored label, then the text
for (const item of items.slice(1, 1 + restCount)) {
  const row = w.addStack()
  row.centerAlignContent()
  if (item.url) row.url = item.url
  const tag = row.addStack()
  tag.size = new Size(66, 0)
  const tt = tag.addText(String(item.tag).toUpperCase())
  tt.font = Font.boldSystemFont(9)
  tt.textColor = new Color(item.color || "#ffffff")
  tt.lineLimit = 1
  tt.minimumScaleFactor = 0.7
  tag.addSpacer()
  const text = row.addText(String(item.text))
  text.font = Font.systemFont(11)
  text.textColor = new Color("#ffffff", 0.92)
  text.lineLimit = size === "large" ? 2 : 1
  text.minimumScaleFactor = 0.75
  row.addSpacer()
  w.addSpacer(size === "large" ? 7 : 4)
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentMedium()
Script.complete()
