// Paste this once. It always runs the newest version of the widget from GitHub.
const FILE = "SportsWidget.js"
const URL = "https://raw.githubusercontent.com/Kabli001-coder/widget-data/main/" + FILE
const fm = FileManager.local()
const saved = fm.joinPath(fm.documentsDirectory(), "latest-" + FILE)
let code
try {
  code = await new Request(URL + "?t=" + Date.now()).loadString()
  if (!code.includes("Script.setWidget")) throw new Error("bad download")
  fm.writeString(saved, code)
} catch (e) {
  if (!fm.fileExists(saved)) throw new Error("No internet and no saved copy yet")
  code = fm.readString(saved)
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
await new AsyncFunction(code)()
