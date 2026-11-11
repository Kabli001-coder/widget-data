const DATA_URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/sports.json"

// Load the latest data; fall back to the last saved copy if offline
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

// Your private league (the biggest invitational one), Saudi Arabia, Overall
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

// Player problems and price changes worked out live from your actual squad
async function liveSquad() {
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
      if (e.status === "s") out.push(e.web_name + " suspended")
      else if (e.status === "i") out.push(e.web_name + " injured")
      else if (e.status === "u" || e.status === "n") out.push(e.web_name + " unavailable")
      else if (e.status === "d") out.push(e.web_name + " doubt" + (c != null ? ", " + c + "%" : ""))
      else if (fpl.current_event < 19 && e.yellow_cards === 4) yellows.push(e.web_name)
    }
    if (yellows.length) out.push(yellows.join(", ") + " one yellow from a ban")
    if (!out.length) out.push("Your squad is all fit")
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
const COMP = { PL: "Premier League", UCL: "Champions League", UEL: "Europa League", FA: "FA Cup", EFL: "League Cup" }
const LEAGUE_NAME = {
  "eng.1": "Premier League", "uefa.champions": "Champions League", "uefa.europa": "Europa League",
  "esp.1": "La Liga", "ita.1": "Serie A", "ger.1": "Bundesliga", "fra.1": "Ligue 1", "eng.fa": "FA Cup",
  "eng.league_cup": "League Cup", "uefa.nations": "Nations League", "fifa.worldq.uefa": "World Cup qualifier",
  "fifa.friendly": "Friendly", "ksa.1": "Saudi Pro League"
}
const ABBR = {
  "liverpool": "LIV", "man united": "MUN", "manchester united": "MUN", "man city": "MCI", "manchester city": "MCI",
  "club brugge": "BRU", "everton": "EVE", "sunderland": "SUN", "arsenal": "ARS", "chelsea": "CHE", "tottenham": "TOT",
  "spurs": "TOT", "newcastle": "NEW", "aston villa": "AVL", "brighton": "BHA", "west ham": "WHU", "fulham": "FUL",
  "brentford": "BRE", "crystal palace": "CRY", "bournemouth": "BOU", "nottingham forest": "NFO", "nott'm forest": "NFO",
  "leeds": "LEE", "wolves": "WOL", "burnley": "BUR", "ipswich": "IPS", "hull city": "HUL", "coventry city": "COV",
  "real madrid": "RMA", "barcelona": "BAR", "bayern munich": "BAY", "psg": "PSG", "inter": "INT", "juventus": "JUV"
}
const boards = {}
let anyLive = false

function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function abbr(name) {
  const n = norm(name).trim()
  if (ABBR[n]) return ABBR[n]
  const words = n.replace(/\b(fc|cf|afc)\b/g, "").trim().split(/\s+/)
  return (words[words.length - 1] || n).slice(0, 3).toUpperCase()
}

function teamMatch(name, display) {
  const words = norm(name).replace(/\bman\b/, "manchester").replace(/\butd\b/, "united").split(/\s+/)
  const d = norm(display)
  return words.every(x => d.includes(x))
}

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

// Returns the score once a match has kicked off, otherwise null
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
      short: (home.team.abbreviation || abbr(home.team.displayName)) + " " + home.score + "-" + away.score + " " + (away.team.abbreviation || abbr(away.team.displayName)),
      sub: live ? "LIVE " + (ev.status.displayClock || ev.status.type.shortDetail) : "Full time",
      live: live
    }
  } catch (e) {
    return null
  }
}

// ---------- Neon look ----------
const WHITE = Color.white()
const DIM = new Color("#ffffff", 0.62)
const AMBER = new Color("#ffcf70")
const UPGREEN = new Color("#34c759")
const NEON = {
  green: ["#dcffe9", "#2bff88"],
  red: ["#ffd9e0", "#ff2d55"],
  white: ["#ffffff", "#9fdcff"]
}

function fmt(date, pattern) {
  const f = new DateFormatter()
  f.dateFormat = pattern
  return f.string(date)
}

// Text that glows like a neon tube
function neon(parent, text, size, kind, ultra) {
  const t = parent.addText(text)
  t.font = ultra ? Font.ultraLightSystemFont(size) : Font.lightSystemFont(size)
  t.textColor = new Color(NEON[kind][0])
  t.shadowColor = new Color(NEON[kind][1])
  t.shadowRadius = 9
  t.shadowOffset = new Point(0, 0)
  t.lineLimit = 1
  t.minimumScaleFactor = 0.5
  return t
}

function plain(parent, text, size, color, weight) {
  const t = parent.addText(text)
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semi" ? Font.semiboldSystemFont(size) : Font.systemFont(size)
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
}

// Dark background with a soft green glow behind the top of the widget
function background() {
  const W = 364, H = 382
  const dc = new DrawContext()
  dc.size = new Size(W, H)
  dc.opaque = true
  dc.respectScreenScale = false
  dc.setFillColor(new Color("#050a08"))
  dc.fillRect(new Rect(0, 0, W, H))
  const steps = 26, cx = W / 2, cy = H * 0.3
  const from = [5, 10, 8], to = [17, 42, 34]
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const r = 330 * (1 - t) + 20
    const c = from.map((v, k) => Math.round(v + (to[k] - v) * t))
    dc.setFillColor(new Color("#" + c.map(v => v.toString(16).padStart(2, "0")).join("")))
    dc.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2))
  }
  return dc.getImage()
}

// Glowing green ring that fills as the deadline gets closer
function ringImage(progress) {
  const S = 150, R = 62, c = S / 2
  const dc = new DrawContext()
  dc.size = new Size(S, S)
  dc.opaque = false
  dc.respectScreenScale = true
  dc.setLineWidth(4)
  dc.setStrokeColor(new Color("#ffffff", 0.12))
  dc.strokeEllipse(new Rect(c - R, c - R, R * 2, R * 2))
  const steps = 90, end = Math.max(2, Math.round(steps * Math.min(Math.max(progress, 0.03), 1)))
  const arc = () => {
    const p = new Path()
    for (let i = 0; i <= end; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (i / steps)
      const pt = new Point(c + R * Math.cos(a), c + R * Math.sin(a))
      if (i === 0) p.move(pt); else p.addLine(pt)
    }
    return p
  }
  // Wide faint strokes first, to fake the glow, then the bright tube on top
  const layers = [[22, 0.07], [16, 0.10], [11, 0.16], [7, 0.28]]
  for (const [width, alpha] of layers) {
    dc.addPath(arc())
    dc.setLineWidth(width)
    dc.setStrokeColor(new Color("#2bff88", alpha))
    dc.strokePath()
  }
  dc.addPath(arc())
  dc.setLineWidth(4)
  dc.setStrokeColor(new Color("#dcffe9"))
  dc.strokePath()
  return dc.getImage()
}

function centerRow(parent, build) {
  const s = parent.addStack()
  s.addSpacer()
  build(s)
  s.addSpacer()
}

// One game in a column: competition, the game, when
function game(parent, comp, title, when, whenColor) {
  if (comp) {
    const c = plain(parent, comp, 9, new Color("#8ef0b8"), "semi")
    c.minimumScaleFactor = 0.8
  }
  plain(parent, title, 12, WHITE, "semi")
  if (when) plain(parent, when, 10, whenColor || DIM)
  parent.addSpacer(6)
}

const size = config.widgetFamily || "large"
const w = new ListWidget()
w.backgroundImage = background()
w.setPadding(12, 14, 10, 14)

if (!data) {
  plain(w, "No data yet. Check your connection.", 13, WHITE)
} else {
  const RED = new Color("#ff5a76")
  const squad = await liveSquad()

  // ---------- Top: countdown ring and the next Liverpool match ----------
  const top = w.addStack()
  top.centerAlignContent()

  const deadline = new Date(data.deadline.time)
  const mins = Math.floor((deadline.getTime() - Date.now()) / 60000)
  const progress = mins <= 0 ? 1 : 1 - mins / (14 * 24 * 60)
  let bigText, smallText
  if (mins <= 0) { bigText = "Locked"; smallText = "" }
  else if (mins < 60) { bigText = mins + "m"; smallText = "" }
  else if (mins < 1440) { bigText = Math.floor(mins / 60) + "h"; smallText = (mins % 60) + "m" }
  else { bigText = Math.floor(mins / 1440) + "d"; smallText = Math.floor((mins % 1440) / 60) + "h" }

  const ring = top.addStack()
  ring.layoutVertically()
  ring.size = new Size(132, 132)
  ring.backgroundImage = ringImage(progress)
  ring.addSpacer()
  centerRow(ring, s => neon(s, bigText, mins <= 0 ? 20 : 30, "green"))
  if (smallText) centerRow(ring, s => neon(s, smallText, 17, "green"))
  centerRow(ring, s => plain(s, "to GW" + data.deadline.gw + " deadline", 9, DIM))
  ring.addSpacer()

  top.addSpacer(12)
  const match = top.addStack()
  match.layoutVertically()

  const games = (data.liverpool || []).filter(g => new Date(g.time).getTime() > Date.now() - 6 * 3600000)
  const g = games[0]
  if (g) {
    const kick = new Date(g.time)
    const sc = await liveScore(ESPN[g.comp], g.time, "Liverpool", g.opp)
    const home = g.venue === "H" ? "LIV" : abbr(g.opp)
    const away = g.venue === "H" ? abbr(g.opp) : "LIV"
    if (sc) {
      neon(match, sc.short, 25, "red")
      neon(match, sc.sub, 17, sc.live ? "red" : "white", true)
    } else {
      const line = match.addStack()
      line.centerAlignContent()
      neon(line, home.split("").join(" "), 26, "red")
      line.addSpacer(6)
      neon(line, "v", 13, "white")
      line.addSpacer(6)
      neon(line, away.split("").join(" "), 26, "red")
      neon(match, fmt(kick, "h:mm a"), 22, "white", true)
    }
    plain(match, COMP[g.comp] || g.comp, 10, new Color("#8ef0b8"), "semi")
    plain(match, fmt(kick, "EEE d MMM") + (g.venue === "H" ? ", home" : ", away"), 10, DIM)
  } else {
    plain(match, "No Liverpool fixture listed", 11, DIM)
  }

  // Your points and league positions
  if (fpl) {
    match.addSpacer(7)
    plain(match, fpl.summary_event_points + " pts in GW" + fpl.current_event, 11, WHITE, "bold")
    match.addSpacer(2)
    for (const [name, l] of fplRows()) {
      const r = match.addStack()
      r.centerAlignContent()
      plain(r, name, 10, DIM)
      r.addSpacer()
      plain(r, compact(l.entry_rank), 10.5, WHITE, "semi")
      r.addSpacer(3)
      const last = l.entry_last_rank || 0
      const up = last > 0 && l.entry_rank < last
      const down = last > 0 && l.entry_rank > last
      plain(r, up ? "▲" : down ? "▼" : "–", 8, up ? UPGREEN : down ? RED : DIM)
      match.addSpacer(2)
    }
  }

  if (size === "large") {
    w.addSpacer(10)

    // ---------- Two columns: padel and big games, each with its competition ----------
    const cols = w.addStack()
    cols.topAlignContent()
    const left = cols.addStack()
    left.layoutVertically()
    left.size = new Size(148, 0)
    cols.addSpacer(12)
    const right = cols.addStack()
    right.layoutVertically()
    right.size = new Size(148, 0)

    plain(left, "Padel", 10.5, DIM, "bold")
    left.addSpacer(4)
    const padel = data.padel || []
    for (const p of padel.slice(0, 2)) {
      const comp = p.comp || (/junior|ksa/i.test(p.title) ? "Asia Junior Cup" : /\bP1\b|\bP2\b|major|premier padel/i.test(p.title) ? "Premier Padel" : "")
      game(left, comp, p.title, p.sub)
      for (const line of (p.lines || []).slice(0, 3)) plain(left, line, 9, AMBER)
    }

    plain(right, "Big games", 10.5, DIM, "bold")
    right.addSpacer(4)
    const big = (data.big || []).filter(b => !b.time || new Date(b.time).getTime() > Date.now() - 6 * 3600000)
    for (const b of big.slice(0, 2)) {
      const comp = b.comp || LEAGUE_NAME[b.league] || ""
      const teams = String(b.title).split(" v ")
      const sc = teams.length === 2 ? await liveScore(b.league, b.time, teams[0], teams[1]) : null
      if (sc) game(right, comp, sc.title, sc.sub, sc.live ? RED : null)
      else game(right, comp, b.title, b.time ? fmt(new Date(b.time), "EEE d MMM, h:mm a") : b.sub)
    }

    // ---------- Bottom lines: your players, prices, Liverpool's game after next ----------
    w.addSpacer(2)
    const problems = (squad && squad.problems) || data.problems || []
    if (problems.length) {
      const t = plain(w, problems.slice(0, 3).join(". ") + ".", 10, AMBER)
      t.lineLimit = 2
      t.minimumScaleFactor = 0.85
    }
    if (squad && squad.prices) {
      w.addSpacer(2)
      const txt = squad.prices.length
        ? "Prices: " + squad.prices.slice(0, 3).map(p => (p.change > 0 ? "▲ " : "▼ ") + p.name + " £" + p.now.toFixed(1) + "m").join(", ")
        : "Prices: no changes for your players"
      plain(w, txt, 10, DIM)
    }
    const g2 = games[1]
    if (g2) {
      w.addSpacer(2)
      plain(w, "Then " + g2.opp + (g2.venue === "H" ? " at home, " : " away, ") + (COMP[g2.comp] || g2.comp) + ", " + fmt(new Date(g2.time), "EEE d MMM, h:mm a"), 10, DIM)
    }
  }
}
w.addSpacer()

w.refreshAfterDate = new Date(Date.now() + (anyLive ? 5 : 30) * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentLarge()
Script.complete()
