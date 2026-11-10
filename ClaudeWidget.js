const DATA_URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/news.json"

// Load today's data; fall back to the last saved copy if offline
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
    data = { updated: "", items: [{ tag: "Offline", color: "#888888", text: "No data yet. Check your connection." }] }
  }
}

const size = config.widgetFamily || "medium"
const maxItems = size === "small" ? 2 : size === "large" ? 8 : 4

const w = new ListWidget()
const bg = new LinearGradient()
bg.colors = [new Color("#0f1319"), new Color("#1b2230")]
bg.locations = [0, 1]
w.backgroundGradient = bg
w.setPadding(10, 14, 10, 14)

// Header
const head = w.addStack()
head.centerAlignContent()
const title = head.addText("TECH TODAY")
title.font = Font.heavySystemFont(11)
title.textColor = new Color("#8fa3bf")
head.addSpacer()
const date = head.addText(data.updated || "")
date.font = Font.systemFont(10)
date.textColor = new Color("#5d6b80")
w.addSpacer(6)

// One row per news item, colored by topic
for (const item of data.items.slice(0, maxItems)) {
  const row = w.addStack()
  row.topAlignContent()
  if (item.url) row.url = item.url

  const tag = row.addText(String(item.tag).toUpperCase())
  tag.font = Font.boldSystemFont(10)
  tag.textColor = new Color(item.color || "#ffffff")
  tag.lineLimit = 1
  row.addSpacer(6)

  const text = row.addText(String(item.text))
  text.font = Font.systemFont(11)
  text.textColor = new Color("#e6e9ef")
  text.lineLimit = 2
  text.minimumScaleFactor = 0.85

  w.addSpacer(4)
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentMedium()
Script.complete()
