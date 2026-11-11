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

// Live FPL points and ranks, read straight from the public FPL site on each refresh
const FPL_TEAM_ID = 400195
const fplCache = fm.joinPath(fm.cacheDirectory(), "claude-fpl.json")
let fpl = null
try {
  const r = new Request("https://fantasy.premierleague.com/api/entry/" + FPL_TEAM_ID + "/")
  r.timeoutInterval = 15
  fpl = await r.loadJSON()
  if (!fpl.leagues) throw new Error("bad data")
  fm.writeString(fplCache, JSON.stringify(fpl))
} catch (e) {
  fpl = fm.fileExists(fplCache) ? JSON.parse(fm.readString(fplCache)) : null
}

function compact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M"
  if (n >= 10000) return (n / 1000).toFixed(1) + "K"
  return String(n)
}

// Picks: your private league (the biggest invitational one), Saudi Arabia, Overall
function fplRows() {
  if (!fpl) return []
  const classic = (fpl.leagues && fpl.leagues.classic) || []
  const priv = classic.filter(l => l.league_type === "x")
    .sort((a, b) => (b.rank_count || 0) - (a.rank_count || 0))[0]
  const saudi = classic.find(l => l.name === "Saudi Arabia")
  const overall = classic.find(l => l.name === "Overall")
  const rows = []
  if (priv) rows.push(["A.I.S", priv])
  if (saudi) rows.push(["Saudi", saudi])
  if (overall) rows.push(["Overall", overall])
  return rows
}

// Player problems worked out live from your actual squad (flags, bans, yellow cards)
async function liveProblems() {
  if (!fpl || !fpl.current_event) return null
  const cache = fm.joinPath(fm.cacheDirectory(), "claude-fpl-squad.json")
  try {
    const api = "https://fantasy.premierleague.com/api/"
    const pr = new Request(api + "entry/" + FPL_TEAM_ID + "/event/" + fpl.current_event + "/picks/")
    pr.timeoutInterval = 15
    const picks = await pr.loadJSON()
    const br = new Request(api + "bootstrap-static/")
    br.timeoutInterval = 20
    const boot = await br.loadJSON()
    const byId = {}
    for (const e of boot.elements) byId[e.id] = e
    const out = [], yellows = [], prices = []
    for (const p of picks.picks.sort((a, b) => a.position - b.position)) {
      const e = byId[p.element]
      if (!e) continue
      if (e.cost_change_event) prices.push({ name: e.web_name, change: e.cost_change_event / 10, now: e.now_cost / 10 })
      const c = e.chance_of_playing_next_round
      if (e.status === "s") out.push(e.web_name + ": suspended")
      else if (e.status === "i") out.push(e.web_name + ": injured")
      else if (e.status === "u" || e.status === "n") out.push(e.web_name + ": unavailable")
      else if (e.status === "d") out.push(e.web_name + ": doubt" + (c != null ? ", " + c + "%" : ""))
      else if (fpl.current_event < 19 && e.yellow_cards === 4) yellows.push(e.web_name)
    }
    if (yellows.length) out.push(yellows.join(", ") + ": 1 yellow off ban")
    if (!out.length) out.push("Your squad: all fit")
    prices.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    const result = { problems: out, prices: prices }
    fm.writeString(cache, JSON.stringify(result))
    return result
  } catch (e) {
    return fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null
  }
}

// Live scores from ESPN's public scoreboard, only asked for around kick-off
const ESPN = { PL: "eng.1", UCL: "uefa.champions", FA: "eng.fa", EFL: "eng.league_cup", UEL: "uefa.europa" }
const boards = {}
let anyLive = false

function norm(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function teamMatch(name, display) {
  const words = norm(name).replace(/\bman\b/, "manchester").replace(/\butd\b/, "united").split(/\s+/)
  const d = norm(display)
  return words.every(x => d.includes(x))
}

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

// Returns { title, sub, live } once a match has kicked off, otherwise null
async function liveScore(league, time, teamA, teamB) {
  if (!league || !time) return null
  const t = new Date(time).getTime()
  const now = Date.now()
  if (isNaN(t) || now < t - 10 * 60000 || now > t + 6 * 3600000) return null
  try {
    const key = league + ymd(new Date(t))
    if (!boards[key]) {
      const range = ymd(new Date(t - 86400000)) + "-" + ymd(new Date(t + 86400000))
      const r = new Request("https://site.api.espn.com/apis/site/v2/sports/soccer/" + league + "/scoreboard?dates=" + range)
      r.timeoutInterval = 12
      boards[key] = (await r.loadJSON()).events || []
    }
    const ev = boards[key].find(e => {
      const c = e.competitions[0].competitors
      const has = n => c.some(x => teamMatch(n, x.team.displayName))
      return Math.abs(new Date(e.date).getTime() - t) < 12 * 3600000 && has(teamA) && (!teamB || has(teamB))
    })
    if (!ev || ev.status.type.state === "pre") return null
    const c = ev.competitions[0].competitors
    const home = c.find(x => x.homeAway === "home"), away = c.find(x => x.homeAway === "away")
    const live = ev.status.type.state === "in"
    if (live) anyLive = true
    return {
      title: home.team.shortDisplayName + " " + home.score + "-" + away.score + " " + away.team.shortDisplayName,
      sub: live ? "LIVE " + (ev.status.displayClock || ev.status.type.shortDetail) : "Full time",
      live: live
    }
  } catch (e) {
    return null
  }
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

function item(parent, title, sub, subColor) {
  const a = parent.addText(title)
  a.font = Font.semiboldSystemFont(12)
  a.textColor = WHITE
  a.lineLimit = 1
  a.minimumScaleFactor = 0.8
  if (sub) {
    const b = parent.addText(sub)
    b.font = Font.systemFont(10)
    b.textColor = subColor || DIM
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
    const img = s.addImage(ring(84, 9, progress))
    img.imageSize = new Size(60, 60)
    return img
  })
  left.addSpacer(6)
  centeredText(left, bigText, Font.lightSystemFont(mins <= 0 ? 22 : 30), WHITE)
  if (smallText) centeredText(left, smallText, Font.lightSystemFont(17), WHITE)
  left.addSpacer(8)
  centeredText(left, "FPL GW" + data.deadline.gw, Font.boldSystemFont(10), DIM)
  left.addSpacer(2)
  centeredText(left, fmt(deadline, "EEE d MMM"), Font.systemFont(10), DIM)
  centeredText(left, fmt(deadline, "h:mm a"), Font.systemFont(10), DIM)
  // Your gameweek points and league positions, with up/down arrows
  if (fpl) {
    left.addSpacer(10)
    const pts = centeredText(left, "GW" + fpl.current_event + ": " + fpl.summary_event_points + " pts", Font.semiboldSystemFont(11), WHITE)
    pts.lineLimit = 1
    pts.minimumScaleFactor = 0.6
    left.addSpacer(4)
    for (const [name, l] of fplRows()) {
      const r = left.addStack()
      r.centerAlignContent()
      const a = r.addText(name)
      a.font = Font.systemFont(10)
      a.textColor = DIM
      r.addSpacer()
      const b = r.addText(compact(l.entry_rank))
      b.font = Font.semiboldSystemFont(10.5)
      b.textColor = WHITE
      r.addSpacer(3)
      const last = l.entry_last_rank || 0
      const up = last > 0 && l.entry_rank < last
      const down = last > 0 && l.entry_rank > last
      const c = r.addText(up ? "▲" : down ? "▼" : "–")
      c.font = Font.systemFont(8)
      c.textColor = up ? GREEN : down ? new Color("#ff453a") : DIM
      left.addSpacer(2)
    }
  }
  left.addSpacer(10)
  const squad = await liveProblems()
  const problems = (squad && squad.problems) || data.problems || []
  for (const p of problems.slice(0, 3)) {
    const t = centeredText(left, p, Font.systemFont(9.5), AMBER)
    t.lineLimit = 2
    t.minimumScaleFactor = 0.85
    left.addSpacer(5)
  }

  // ---- Right column: Liverpool, padel, big games ----
  root.addSpacer(12)
  const right = root.addStack()
  right.layoutVertically()
  right.setPadding(15, 4, 10, 12)

  label(right, "LIVERPOOL")
  const RED = new Color("#ff453a")
  const games = (data.liverpool || []).filter(g => new Date(g.time).getTime() > Date.now() - 6 * 3600000)
  for (const g of games.slice(0, 2)) {
    const sc = await liveScore(ESPN[g.comp], g.time, "Liverpool", g.opp)
    if (sc) item(right, sc.title, g.comp + " · " + sc.sub, sc.live ? RED : null)
    else item(right, g.opp + " (" + g.venue + ")", g.comp + " · " + fmt(new Date(g.time), "EEE d MMM, h:mm a"))
  }

  const padel = (data.padel || []).map(parts)
  if (padel.length) {
    right.addSpacer(4)
    label(right, "PADEL")
    const hasLines = padel.some(p => p.lines && p.lines.length)
    for (const p of padel.slice(0, hasLines ? 2 : 3)) {
      item(right, p.title, p.sub)
      // Optional detail lines, e.g. one per junior category with names and score
      if (p.lines && p.lines.length) {
        right.addSpacer(-3)
        for (const line of p.lines.slice(0, 3)) {
          const t = right.addText(line)
          t.font = Font.systemFont(9.5)
          t.textColor = AMBER
          t.lineLimit = 1
          t.minimumScaleFactor = 0.7
        }
        right.addSpacer(5)
      }
    }
  }

  const big = (data.big || []).map(parts)
  if (big.length) {
    right.addSpacer(4)
    label(right, "BIG GAMES")
    const upcoming = big.filter(b => !b.time || new Date(b.time).getTime() > Date.now() - 6 * 3600000)
    for (const b of upcoming.slice(0, padel.length ? 2 : 4)) {
      const teams = String(b.title).split(" v ")
      const sc = teams.length === 2 ? await liveScore(b.league, b.time, teams[0], teams[1]) : null
      if (sc) item(right, sc.title, sc.sub, sc.live ? RED : null)
      else item(right, b.title, b.time ? fmt(new Date(b.time), "EEE d MMM, h:mm a") : b.sub)
    }
  }

  // Price changes this gameweek for players in your squad
  if (squad && squad.prices) {
    right.addSpacer(4)
    label(right, "FPL PRICES")
    if (!squad.prices.length) {
      const t = right.addText("No changes for your players")
      t.font = Font.systemFont(10)
      t.textColor = DIM
    }
    for (const p of squad.prices.slice(0, 2)) {
      const r = right.addStack()
      r.centerAlignContent()
      const up = p.change > 0
      const a = r.addText(up ? "▲" : "▼")
      a.font = Font.systemFont(8)
      a.textColor = up ? GREEN : RED
      r.addSpacer(5)
      const n = r.addText(p.name + "  " + (up ? "+" : "") + p.change.toFixed(1) + "  →  £" + p.now.toFixed(1) + "m")
      n.font = Font.systemFont(11)
      n.textColor = WHITE
      n.lineLimit = 1
      n.minimumScaleFactor = 0.8
      right.addSpacer(2)
    }
  }
  root.addSpacer()
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + (anyLive ? 5 : 30) * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentLarge()
Script.complete()
