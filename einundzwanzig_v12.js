// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: bolt;
// Einundzwanzig Edition by FlashmanBTC
// Updated by Claude (2026-07): parallel requests, timeout handling, status indicators, fallback URLs, card grid theme
// Updated by Claude (2026-09): v11 - update notice, last-known-value cache, stale-data check, fewer external APIs
// Updated by Claude (2026-09): v12 - fix crash once the hashrate passed 1 ZH/s

// Font scaling for smaller displays
// Scale  0 = iPhone 11 Pro
// Scale -4 = iPhone SE 2020
scale = 0

// Change currency: EUR, USD, CHF, GBP, CAD, AUD or JPY
currency = "EUR"

// Change fee order
// 1 = high to low
h_to_l = 0

// Timeout per request in seconds
const TIMEOUT_SEC = 6

// Design theme: "classic" | "mono"
theme = "mono"

// Check once a day whether a new widget version is available (1 = on, 0 = off)
// Only reads version.json from this project's GitHub repository
check_updates = 1

// ─── Color palette ────────────────────────────────────────────────────────────
// Change colors here — both themes pick them up automatically
const C_BG        = "#151515"   // widget background
const C_ACCENT    = "#F7931A"   // main value color (Bitcoin orange)
const C_LABEL     = "#FFFFFF"   // section / row labels
const C_DIM       = "#888888"   // status line, subtle text, cached values
const C_ERROR     = "#555555"   // value color when data unavailable
const C_DIVIDER   = "#2a2a2a"   // divider lines (mono theme)

// Show infos
// In cardgrid: block, fees, moscow, price always shown
// show_hash + show_diff add a 3rd row in cardgrid
// In classic: max 5 active at once
// 1 = on
show_block  = 1
show_fees   = 1
show_moscow = 1
show_price  = 1
show_supply = 1
show_hash   = 1
show_diff   = 1

// ─── Internals (no need to edit below) ───────────────────────────────────────

const VERSION     = 12
const REPO_URL    = "https://github.com/FlashmanBTC/einundzwanzig_widget"
const VERSION_URL = "https://raw.githubusercontent.com/FlashmanBTC/einundzwanzig_widget/main/version.json"
const LOGO_URLS   = [
  "https://raw.githubusercontent.com/FlashmanBTC/einundzwanzig_widget/main/images/logo.png",
  "https://i.ibb.co/MSSJYtq/Einundzwanzig-logo.png"
]

// Start the next fallback if the current source has not answered after this time
const HEDGE_SEC          = 2
// Prices older than this are treated as stale (e.g. a node that is still syncing)
const MAX_PRICE_AGE_SEC  = 60 * 60
// Last known values are shown (greyed) for at most this long
const CACHE_MAX_AGE_H    = 24
const UPDATE_INTERVAL_H  = 24

const fm         = FileManager.local()
const CACHE_PATH = fm.joinPath(fm.documentsDirectory(), "einundzwanzig_cache.json")
const LOGO_PATH  = fm.joinPath(fm.documentsDirectory(), "einundzwanzig_logo.png")
const cache      = loadCache()
if (!cache.values) cache.values = {}

// Helper: fetch with individual timeout
// Returns { ok: true/false, value: ... }
async function fetchWithTimeout(url, type = 'string') {
  return new Promise(async (resolve) => {
    let timedOut = false
    const timer = Timer.schedule(TIMEOUT_SEC * 1000, false, () => {
      timedOut = true
      resolve({ ok: false, value: null })
    })
    try {
      const req = new Request(url)
      let value
      if (type === 'json')   value = await req.loadJSON()
      if (type === 'string') value = await req.loadString()
      if (type === 'image')  value = await req.loadImage()
      // Scriptable does not throw on HTTP errors (e.g. 503 with JSON error body),
      // so check the status code explicitly to let the fallback kick in
      const status = req.response ? req.response.statusCode : 0
      const ok = status >= 200 && status < 300
      if (!timedOut) {
        timer.invalidate()
        resolve({ ok, value: ok ? value : null })
      }
    } catch(e) {
      if (!timedOut) {
        timer.invalidate()
        resolve({ ok: false, value: null })
      }
    }
  })
}

// Helper: try several URLs in order until one returns valid data
// The next URL starts as soon as the current one fails, or after HEDGE_SEC
// if it is merely slow - so a hanging primary costs ~2 s instead of a full timeout
async function fetchFirst(urls, type = 'string', validate = null) {
  return new Promise((resolve) => {
    let next = 0, running = 0, done = false, hedge = null

    const isValid = (value) => {
      if (!validate) return true
      try { return validate(value) } catch(e) { return false }
    }

    const finish = (result) => {
      done = true
      if (hedge) hedge.invalidate()
      resolve(result)
    }

    const startNext = () => {
      if (done || next >= urls.length) return
      if (hedge) hedge.invalidate()
      const url = urls[next++]
      running++
      if (next < urls.length) hedge = Timer.schedule(HEDGE_SEC * 1000, false, startNext)
      fetchWithTimeout(url, type).then((res) => {
        running--
        if (done) return
        if (res.ok && isValid(res.value)) return finish({ ok: true, value: res.value })
        if (next < urls.length) startNext()
        else if (running === 0) finish({ ok: false, value: null })
      })
    }

    startNext()
  })
}

// ─── Validators: reject empty, broken or stale responses ─────────────────────

// A chain never goes backwards: a height well below the last one seen comes from a lagging node
const isHeight = v => {
  if (!/^\d+$/.test(String(v).trim())) return false
  const last = cache.values.height
  return !last || parseInt(String(v).trim()) >= parseInt(String(last.v).trim()) - 2
}
const isFees   = v => v && (typeof v.fastestFee === 'number' || typeof v["1"] === 'number')
const isHash   = v => v && Array.isArray(v.hashrates) && v.hashrates.length > 0
const isDiff   = v => v && v.remainingBlocks != null
const isPrice  = v => {
  if (priceOf(v) == null) return false
  // mempool format carries a timestamp - a syncing node serves hours-old prices with HTTP 200
  if (typeof v.time === 'number') return (Date.now() / 1000 - v.time) < MAX_PRICE_AGE_SEC
  return true
}

// Price in the selected currency; handles mempool { EUR: 95000 } and blockchain.info { EUR: { last: 95000 } }
function priceOf(v) {
  if (!v || v[currency] == null) return null
  if (typeof v[currency] === 'number') return v[currency]
  return typeof v[currency].last === 'number' ? v[currency].last : null
}

const skip = Promise.resolve({ ok: false, value: null })

// Request data - all parallel, each with individual timeout + fallbacks
// Moscow Time is calculated from the price, supply from the block height
const [
  resLogo,
  resHeight,
  resFees,
  resPrice,
  resHash,
  resDiff,
  update
] = await Promise.all([
  loadLogo(),

  // Blockheight: mempool.space -> blockstream.info -> flashman.ch
  (show_block == 1 || show_supply == 1)
    ? fetchFirst([
        'https://mempool.space/api/blocks/tip/height',
        'https://blockstream.info/api/blocks/tip/height',
        'https://mempool.flashman.ch/api/blocks/tip/height'
      ], 'string', isHeight)
    : skip,

  // Fees: mempool.space -> blockstream.info -> flashman.ch
  show_fees == 1
    ? fetchFirst([
        'https://mempool.space/api/v1/fees/recommended',
        'https://blockstream.info/api/fee-estimates',
        'https://mempool.flashman.ch/api/v1/fees/recommended'
      ], 'json', isFees)
    : skip,

  // Price: mempool.space -> blockchain.info -> flashman.ch
  (show_price == 1 || show_moscow == 1)
    ? fetchFirst([
        'https://mempool.space/api/v1/prices',
        'https://blockchain.info/ticker',
        'https://mempool.flashman.ch/api/v1/prices'
      ], 'json', isPrice)
    : skip,

  // Hashrate: mempool.space -> flashman.ch (self-hosted, VPN-friendly fallback)
  show_hash == 1
    ? fetchFirst([
        'https://mempool.space/api/v1/mining/hashrate/1m',
        'https://mempool.flashman.ch/api/v1/mining/hashrate/1m'
      ], 'json', isHash)
    : skip,

  // Difficulty: mempool.space -> flashman.ch (self-hosted, VPN-friendly fallback)
  show_diff == 1
    ? fetchFirst([
        'https://mempool.space/api/v1/difficulty-adjustment',
        'https://mempool.flashman.ch/api/v1/difficulty-adjustment'
      ], 'json', isDiff)
    : skip,

  checkForUpdate()
])

// Fresh value -> remembered; failed -> last known value (greyed), if not too old
// Returns { state: 'ok' | 'cached' | 'fail', value, ts }
function withCache(key, res) {
  if (res.ok) {
    cache.values[key] = { v: res.value, ts: Date.now() }
    return { state: 'ok', value: res.value, ts: Date.now() }
  }
  const c = cache.values[key]
  if (c && Date.now() - c.ts < CACHE_MAX_AGE_H * 3600 * 1000)
    return { state: 'cached', value: c.v, ts: c.ts }
  return { state: 'fail', value: null, ts: null }
}

const dHeight = withCache('height', resHeight)
const dFees   = withCache('fees',   resFees)
const dPrice  = withCache('price',  resPrice)
const dHash   = withCache('hash',   resHash)
const dDiff   = withCache('diff',   resDiff)

// Blockheight
let blockHeight = '⚠️ n/a'
if (dHeight.state != 'fail') {
  let raw = String(dHeight.value).trim()
  let position_block = raw.length-3
  blockHeight = [raw.slice(0, position_block), " ", raw.slice(position_block)].join('')
}

// Mempool Fees
// blockstream.info returns { "1": rate, "3": rate, ... } as fallback
fast = '?'; halfHour = '?'; hour = '?'; fastNum = 0
if (dFees.state != 'fail') {
  if (dFees.value.fastestFee !== undefined) {
    // mempool.space format
    fast     = dFees.value.fastestFee.toString()
    halfHour = dFees.value.halfHourFee.toString()
    hour     = dFees.value.hourFee.toString()
    fastNum  = dFees.value.fastestFee
  } else {
    // blockstream.info format: keys are target blocks
    fastNum  = Math.round(dFees.value["1"])
    fast     = fastNum.toString()
    halfHour = Math.round(dFees.value["3"]).toString()
    hour     = Math.round(dFees.value["6"]).toString()
  }
}
let feesShort = dFees.state != 'fail'
  ? (h_to_l == 1
      ? fast + '·' + halfHour + '·' + hour
      : hour + '·' + halfHour + '·' + fast)
  : '⚠️ n/a'

// Price in the selected currency
let price = dPrice.state != 'fail' ? priceOf(dPrice.value) : null

// Moscow Time: sats per 1 unit of fiat, shown as HH:MM (e.g. 1344 sats -> 13:44)
let MoscowTime = '⚠️ n/a'
if (price) {
  let sats = Math.round(100000000 / price).toString().padStart(4, '0')
  let position_moscow = sats.length-2
  MoscowTime = [sats.slice(0, position_moscow), ":", sats.slice(position_moscow)].join('')
}

// Shitcoin/BTC (no decimals)
let Shitcoin = price ? Math.round(price).toString() : '⚠️ n/a'

// Bitcoin supply: sum of all block subsidies up to the current height, in whole BTC
let Supply = '⚠️ n/a'
if (dHeight.state != 'fail') {
  Supply = Math.floor(supplyAtHeight(parseInt(String(dHeight.value).trim())) / 100000000).toString()
}

// Bitcoin hashrate
// /1m returns { hashrates: [{avgHashrate, timestamp}, ...] }
// Use the last (most recent) entry in the array
let HashInExa = '⚠️ n/a'
if (dHash.state != 'fail') {
  let arr = dHash.value.hashrates
  let rawHash = arr[arr.length - 1].avgHashrate
  // Plain number math: from 1 ZH/s (1e21 H/s) on, toString() returns exponent notation, which BigInt cannot parse
  HashInExa = Math.floor(rawHash / 1e18).toString() + ' EH/s'
}

// Difficulty adjustment
let DiffDisplay = '⚠️ n/a'
if (dDiff.state != 'fail') {
  let change  = parseFloat(dDiff.value.difficultyChange).toFixed(1)
  let rblocks = dDiff.value.remainingBlocks.toString()
  DiffDisplay = change + '% / ' + rblocks + ' blk'
}

// Status indicator: 🟢 all fresh | 🟡 partly fresh | 🔴 nothing fresh (cached values may still show)
const timeStr = formatTime(new Date())
const shown = [
  show_block  ? dHeight : null,
  show_fees   ? dFees   : null,
  show_moscow ? dPrice  : null,
  show_price  ? dPrice  : null,
  show_supply ? dHeight : null,
  show_hash   ? dHash   : null,
  show_diff   ? dDiff   : null,
].filter(d => d !== null)
const allOk  = shown.every(d => d.state == 'ok')
const noneOk = shown.every(d => d.state != 'ok')
const statusIcon = noneOk ? '🔴' : allOk ? '🟢' : '🟡'

// Oldest cached value shown, so the user knows how old the grey numbers are
const cachedTimes = shown.filter(d => d.state == 'cached').map(d => d.ts)
const statusText = statusIcon + ' ' + timeStr +
  (cachedTimes.length > 0 ? '  ·  cache ' + formatTime(new Date(Math.min(...cachedTimes))) : '')

const updateAvailable = update && update.latest > VERSION
const updateText = updateAvailable ? '⬆ Update v' + update.latest + ' available' : null

saveCache()

let widget = await createWidget()
if (updateAvailable) widget.url = REPO_URL

// Check where the script is running
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  widget.presentLarge()
}

Script.complete()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d) {
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
}

// Total mined sats: 50 BTC per block, halving every 210000 blocks (genesis included)
function supplyAtHeight(height) {
  let blocks = height + 1, sats = 0, era = 0
  while (blocks > 0 && era < 64) {
    let n = Math.min(blocks, 210000)
    sats += n * Math.floor(5000000000 / 2 ** era)
    blocks -= n
    era++
  }
  return sats
}

function stateColor(d) {
  if (d.state == 'ok')     return new Color(C_ACCENT)
  if (d.state == 'cached') return new Color(C_DIM)
  return new Color(C_ERROR)
}

function loadCache() {
  try {
    if (fm.fileExists(CACHE_PATH)) return JSON.parse(fm.readString(CACHE_PATH))
  } catch(e) {}
  return {}
}

function saveCache() {
  try { fm.writeString(CACHE_PATH, JSON.stringify(cache)) } catch(e) {}
}

// Logo is downloaded once and then read from local storage
async function loadLogo() {
  try {
    if (fm.fileExists(LOGO_PATH)) return { ok: true, value: fm.readImage(LOGO_PATH) }
  } catch(e) {}
  const res = await fetchFirst(LOGO_URLS, 'image')
  if (res.ok) {
    try { fm.writeImage(LOGO_PATH, res.value) } catch(e) {}
  }
  return res
}

// Reads version.json at most once per UPDATE_INTERVAL_H; the result is kept in the cache
async function checkForUpdate() {
  if (check_updates != 1) return null
  const last = cache.update
  if (last && Date.now() - last.checked < UPDATE_INTERVAL_H * 3600 * 1000) return last
  const res = await fetchWithTimeout(VERSION_URL, 'json')
  if (res.ok && res.value && typeof res.value.latest === 'number')
    cache.update = { checked: Date.now(), latest: res.value.latest }
  // On failure keep the old result and try again on the next refresh
  return cache.update || null
}

function addUpdateLine(widget, fontSize) {
  if (!updateText) return
  let line = widget.addText(updateText)
  line.centerAlignText()
  line.font = Font.boldSystemFont(fontSize)
  line.textColor = new Color(C_ACCENT)
}

// ─── Widget builder ───────────────────────────────────────────────────────────

async function createWidget() {
  if (theme === "mono")
    return createMono()
  else
    return createClassic()
}

// ─── Theme: Classic ───────────────────────────────────────────────────────────

async function createClassic() {
  // Count active elements to scale fonts responsively
  let activeCount = [show_block, show_fees, show_moscow, show_price, show_supply, show_hash, show_diff]
    .filter(v => v == 1).length

  // Font sizes scale down as more elements are shown
  // Base sizes at 5 elements, smaller for 6-7
  let labelFont  = activeCount <= 5 ? 16+scale : activeCount == 6 ? 13+scale : 11+scale
  let blockFont  = activeCount <= 5 ? 40+scale : activeCount == 6 ? 32+scale : 26+scale
  let largeFont  = activeCount <= 5 ? 36+scale : activeCount == 6 ? 28+scale : 22+scale  // fees, moscow
  let medFont    = activeCount <= 5 ? 24+scale : activeCount == 6 ? 20+scale : 16+scale  // price, supply, hash, diff
  let spacerSize = activeCount <= 5 ? 8 : activeCount == 6 ? 4 : 2

  let listwidget = new ListWidget()
  let nextRefresh = Date.now() + 1000*60
  listwidget.refreshAfterDate = new Date(nextRefresh)
  listwidget.backgroundColor = new Color(C_BG)

  // Logo
  if (resLogo.ok)
    listwidget.addImage(resLogo.value).centerAlignImage()
  else {
    let fallback = listwidget.addText('₿ Einundzwanzig')
    fallback.centerAlignText()
    fallback.font = Font.boldSystemFont(18+scale)
    fallback.textColor = new Color(C_ACCENT)
  }

  listwidget.addSpacer(4)

  // Status line
  let statusLine = listwidget.addText(statusText)
  statusLine.centerAlignText()
  statusLine.font = Font.systemFont(11+scale)
  statusLine.textColor = new Color(C_DIM)
  addUpdateLine(listwidget, 11+scale)

  listwidget.addSpacer(spacerSize)

  if(show_block == 1) {
    let blockTitel = listwidget.addText("Blockheight")
    blockTitel.centerAlignText()
    blockTitel.font = Font.boldSystemFont(labelFont)
    blockTitel.textColor = new Color(C_LABEL)
    let block = listwidget.addText(blockHeight)
    block.centerAlignText()
    block.font = Font.boldSystemFont(blockFont)
    block.textColor = stateColor(dHeight)
  }

  if(show_fees == 1) {
    let feesTitel = listwidget.addText("Mempool Fees")
    feesTitel.centerAlignText()
    feesTitel.font = Font.boldSystemFont(labelFont)
    feesTitel.textColor = new Color(C_LABEL)
    if(h_to_l == 1)
      fees = listwidget.addText(fast + " H | " + halfHour + " M | " + hour + " L")
    else
      fees = listwidget.addText(hour + " L | " + halfHour + " M | " + fast + " H")
    fees.centerAlignText()
    // Fee font scales with both activeCount and fee value size
    let feeBase = activeCount <= 5 ? 40 : activeCount == 6 ? 30 : 24
    if(fastNum < 10)
      fees.font = Font.boldSystemFont(feeBase+scale)
    else if(fastNum < 100)
      fees.font = Font.boldSystemFont((feeBase-4)+scale)
    else
      fees.font = Font.boldSystemFont((feeBase-8)+scale)
    fees.textColor = stateColor(dFees)
  }

  if(show_moscow == 1) {
    let moscowTitel = listwidget.addText("Moscow Time")
    moscowTitel.centerAlignText()
    moscowTitel.font = Font.boldSystemFont(labelFont)
    moscowTitel.textColor = new Color(C_LABEL)
    let moscowTime = listwidget.addText(MoscowTime)
    moscowTime.centerAlignText()
    moscowTime.font = Font.boldSystemFont(largeFont)
    moscowTime.textColor = price ? stateColor(dPrice) : new Color(C_ERROR)
  }

  if(show_price == 1) {
    let shitcoinTitel = listwidget.addText(currency+"/BTC")
    shitcoinTitel.centerAlignText()
    shitcoinTitel.font = Font.boldSystemFont(labelFont)
    shitcoinTitel.textColor = new Color(C_LABEL)
    let shitcoin = listwidget.addText(Shitcoin)
    shitcoin.centerAlignText()
    shitcoin.font = Font.boldSystemFont(medFont)
    shitcoin.textColor = price ? stateColor(dPrice) : new Color(C_ERROR)
  }

  if(show_supply == 1) {
    let supplyTitel = listwidget.addText("Supply")
    supplyTitel.centerAlignText()
    supplyTitel.font = Font.boldSystemFont(labelFont)
    supplyTitel.textColor = new Color(C_LABEL)
    let supply = listwidget.addText(Supply)
    supply.centerAlignText()
    supply.font = Font.boldSystemFont(medFont)
    supply.textColor = stateColor(dHeight)
  }

  if(show_hash == 1) {
    let hashTitel = listwidget.addText("Hashrate")
    hashTitel.centerAlignText()
    hashTitel.font = Font.boldSystemFont(labelFont)
    hashTitel.textColor = new Color(C_LABEL)
    let hash = listwidget.addText(HashInExa)
    hash.centerAlignText()
    hash.font = Font.boldSystemFont(medFont)
    hash.textColor = stateColor(dHash)
  }

  if(show_diff == 1) {
    let diffTitel = listwidget.addText("Difficulty adjustment")
    diffTitel.centerAlignText()
    diffTitel.font = Font.boldSystemFont(labelFont)
    diffTitel.textColor = new Color(C_LABEL)
    let diff = listwidget.addText(DiffDisplay)
    diff.centerAlignText()
    diff.font = Font.boldSystemFont(medFont)
    diff.textColor = stateColor(dDiff)
  }

  return listwidget
}

// ─── Theme: Mono ─────────────────────────────────────────────────────────────
// Layout: Logo + status, then label/value rows separated by thin lines
// Clean monospace table style, no cards needed

async function createMono() {
  // Count active rows below block to scale fonts responsively
  let activeRows = [show_fees, show_moscow, show_price, show_supply, show_hash, show_diff]
    .filter(v => v == 1).length

  // Font sizes: bigger when fewer rows, smaller when more
  let rowFont   = activeRows <= 4 ? 18+scale : activeRows == 5 ? 16+scale : 14+scale
  let labelFont = 9+scale
  let blockFont = activeRows <= 4 ? 38+scale : activeRows == 5 ? 34+scale : 30+scale

  let listwidget = new ListWidget()
  let nextRefresh = Date.now() + 1000*60
  listwidget.refreshAfterDate = new Date(nextRefresh)
  listwidget.backgroundColor = new Color(C_BG)
  listwidget.setPadding(14, 16, 14, 16)

  // Logo: full width, natural size
  if (resLogo.ok)
    listwidget.addImage(resLogo.value).centerAlignImage()
  else {
    let fallback = listwidget.addText('₿ Einundzwanzig')
    fallback.centerAlignText()
    fallback.font = Font.boldSystemFont(20+scale)
    fallback.textColor = new Color(C_ACCENT)
  }

  // Status tight under logo
  listwidget.addSpacer(3)
  let statusLine = listwidget.addText(statusText)
  statusLine.centerAlignText()
  statusLine.font = Font.systemFont(10+scale)
  statusLine.textColor = new Color(C_DIM)
  addUpdateLine(listwidget, 10+scale)

  // Flexible spacer above block fills remaining space
  listwidget.addSpacer()

  if (show_block == 1) {
    let blockLabel = listwidget.addText("BLOCK")
    blockLabel.centerAlignText()
    blockLabel.font = Font.boldSystemFont(9+scale)
    blockLabel.textColor = new Color(C_LABEL)
    let blockVal = listwidget.addText(blockHeight)
    blockVal.centerAlignText()
    // Start very large, minimumScaleFactor lets Scriptable shrink to fit
    blockVal.font = Font.boldSystemFont(72+scale)
    blockVal.minimumScaleFactor = 0.3
    blockVal.textColor = stateColor(dHeight)
  }

  // Small fixed spacer below block, tight to the rows
  listwidget.addSpacer(8)

  // Rows pushed to bottom, evenly spaced via dividers
  const priceColor = price ? stateColor(dPrice) : new Color(C_ERROR)
  if (show_fees == 1)
    addRow(listwidget, "FEES  L·M·H", feesShort, stateColor(dFees), rowFont, labelFont)
  if (show_moscow == 1)
    addRow(listwidget, "MOSCOW", MoscowTime, priceColor, rowFont, labelFont)
  if (show_price == 1)
    addRow(listwidget, currency+"/BTC", Shitcoin, priceColor, rowFont, labelFont)
  if (show_supply == 1)
    addRow(listwidget, "SUPPLY", Supply, stateColor(dHeight), rowFont, labelFont)
  if (show_hash == 1)
    addRow(listwidget, "HASHRATE", HashInExa, stateColor(dHash), rowFont, labelFont)
  if (show_diff == 1)
    addRow(listwidget, "DIFFICULTY", DiffDisplay, stateColor(dDiff), rowFont, labelFont)

  return listwidget
}

function addRow(widget, label, value, color, rowFont, labelFont) {
  addDivider(widget)
  let row = widget.addStack()
  row.layoutHorizontally()
  row.setPadding(6, 0, 6, 0)

  let lbl = row.addText(label)
  lbl.font = Font.boldSystemFont(labelFont)
  lbl.textColor = new Color(C_LABEL)
  lbl.leftAlignText()

  row.addSpacer()

  let val = row.addText(value)
  val.font = Font.boldSystemFont(rowFont)
  val.textColor = color
  val.rightAlignText()
  val.minimumScaleFactor = 0.7
}

function addDivider(widget) {
  let line = widget.addStack()
  line.backgroundColor = new Color(C_DIVIDER)
  line.size = new Size(0, 1)
}
