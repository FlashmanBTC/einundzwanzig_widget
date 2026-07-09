// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: bolt;
// Einundzwanzig Edition by FlashmanBTC
// Updated by Claude (2026-07): parallel requests, timeout handling, status indicators, fallback URLs, card grid theme

// Font scaling for smaller displays
// Scale  0 = iPhone 11 Pro
// Scale -4 = iPhone SE 2020
scale = 0

// Change currency EUR or USD or CHF
currency = "EUR"

// Change fee order
// 1 = high to low
h_to_l = 0

// Timeout per request in seconds
const TIMEOUT_SEC = 6

// Design theme: "classic" | "mono"
theme = "mono"

// ─── Color palette ────────────────────────────────────────────────────────────
// Change colors here — both themes pick them up automatically
const C_BG        = "#151515"   // widget background
const C_ACCENT    = "#F7931A"   // main value color (Bitcoin orange)
const C_LABEL     = "#FFFFFF"   // section / row labels
const C_DIM       = "#888888"   // status line, subtle text
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
      if (!timedOut) {
        timer.invalidate()
        resolve({ ok: true, value })
      }
    } catch(e) {
      if (!timedOut) {
        timer.invalidate()
        resolve({ ok: false, value: null })
      }
    }
  })
}

// Helper: fetch with fallback URL
// Tries primary first, falls back to secondary on failure
async function fetchWithFallback(primaryUrl, fallbackUrl, type = 'string') {
  const primary = await fetchWithTimeout(primaryUrl, type)
  if (primary.ok) return primary
  return await fetchWithTimeout(fallbackUrl, type)
}

// Request data - all parallel, each with individual timeout + fallback
const [
  resLogo,
  resHeight,
  resFees,
  resMoscow,
  resPrice,
  resSupply,
  resHash,
  resDiff
] = await Promise.all([
  fetchWithTimeout('https://i.ibb.co/MSSJYtq/Einundzwanzig-logo.png', 'image'),

  // Blockheight: mempool.space -> blockstream.info
  fetchWithFallback(
    'https://mempool.space/api/blocks/tip/height',
    'https://blockstream.info/api/blocks/tip/height',
    'string'
  ),

  // Fees: mempool.space -> blockstream.info
  fetchWithFallback(
    'https://mempool.space/api/v1/fees/recommended',
    'https://blockstream.info/api/fee-estimates',
    'json'
  ),

  // Moscow Time: blockchain.info -> calculated from price (see below)
  fetchWithTimeout('https://blockchain.info/tobtc?currency='+currency+'&value=1', 'string'),

  // Price: mempool.space -> blockchain.info
  fetchWithFallback(
    'https://mempool.space/api/v1/prices',
    'https://blockchain.info/ticker',
    'json'
  ),

  // Supply: blockchain.info only
  show_supply == 1
    ? fetchWithTimeout('https://blockchain.info/q/totalbc', 'string')
    : Promise.resolve({ ok: true, value: null }),

  // Hashrate: mempool.space -> blitzi.me (self-hosted, VPN-friendly fallback)
  show_hash == 1
    ? fetchWithFallback(
        'https://mempool.space/api/v1/mining/hashrate/1m',
        'https://mempool.blitzi.me/api/v1/mining/hashrate/1m',
        'json'
      )
    : Promise.resolve({ ok: true, value: null }),

  // Difficulty: mempool.space -> blitzi.me (self-hosted, VPN-friendly fallback)
  show_diff == 1
    ? fetchWithFallback(
        'https://mempool.space/api/v1/difficulty-adjustment',
        'https://mempool.blitzi.me/api/v1/difficulty-adjustment',
        'json'
      )
    : Promise.resolve({ ok: true, value: null })
])

// Blockheight
let blockHeight = '⚠️ n/a'
if (resHeight.ok) {
  let raw = resHeight.value.trim()
  let position_block = raw.length-3
  blockHeight = [raw.slice(0, position_block), " ", raw.slice(position_block)].join('')
}

// Mempool Fees
// blockstream.info returns { "1": rate, "3": rate, ... } as fallback
fast = '?'; halfHour = '?'; hour = '?'; fastNum = 0
if (resFees.ok) {
  if (resFees.value.fastestFee !== undefined) {
    // mempool.space format
    fast     = resFees.value.fastestFee.toString()
    halfHour = resFees.value.halfHourFee.toString()
    hour     = resFees.value.hourFee.toString()
    fastNum  = resFees.value.fastestFee
  } else {
    // blockstream.info format: keys are target blocks
    fastNum  = Math.round(resFees.value["1"])
    fast     = fastNum.toString()
    halfHour = Math.round(resFees.value["3"]).toString()
    hour     = Math.round(resFees.value["6"]).toString()
  }
}
let feesDisplay = resFees.ok
  ? (h_to_l == 1
      ? fast + ' H | ' + halfHour + ' M | ' + hour + ' L'
      : hour + ' L | ' + halfHour + ' M | ' + fast + ' H')
  : '⚠️ n/a'
let feesShort = resFees.ok
  ? (h_to_l == 1
      ? fast + '·' + halfHour + '·' + hour
      : hour + '·' + halfHour + '·' + fast)
  : '⚠️ n/a'

// Price: normalize mempool.space vs blockchain.info response format
let priceEUR = null, priceUSD = null, priceCHF = null
if (resPrice.ok) {
  if (resPrice.value.EUR !== undefined && typeof resPrice.value.EUR === 'number') {
    // mempool.space format: { EUR: 95000, USD: 103000, ... }
    priceEUR = resPrice.value.EUR
    priceUSD = resPrice.value.USD
    priceCHF = resPrice.value.CHF
  } else {
    // blockchain.info format: { EUR: { last: 95000 }, ... }
    priceEUR = resPrice.value.EUR ? resPrice.value.EUR.last : null
    priceUSD = resPrice.value.USD ? resPrice.value.USD.last : null
    priceCHF = resPrice.value.CHF ? resPrice.value.CHF.last : null
  }
}

// Moscow Time: blockchain.info direct, or calculated from price as fallback
let MoscowTime = '⚠️ n/a'
if (resMoscow.ok) {
  MoscowTime = Number(resMoscow.value).toFixed(8)
  MoscowTime = MoscowTime.substring(6)
  let position_moscow = MoscowTime.length-2
  MoscowTime = [MoscowTime.slice(0, position_moscow), ":", MoscowTime.slice(position_moscow)].join('')
} else if (resPrice.ok) {
  // Fallback: calculate from price (1 / price * 100000000 = sats per fiat unit)
  let price = currency == "EUR" ? priceEUR : currency == "USD" ? priceUSD : priceCHF
  if (price) {
    let sats = Math.round(100000000 / price).toString().padStart(8, '0')
    let position_moscow = sats.length-2
    MoscowTime = [sats.slice(0, position_moscow), ":", sats.slice(position_moscow)].join('')
  }
}

// Shitcoin/BTC (no decimals)
let Shitcoin = '⚠️ n/a'
if (resPrice.ok) {
  let price = currency == "EUR" ? priceEUR : currency == "USD" ? priceUSD : priceCHF
  if (price) Shitcoin = Math.round(price).toString()
}

// Bitcoin supply (convert satoshis to BTC, no decimals)
let Supply = '⚠️ n/a'
if (show_supply == 1 && resSupply.ok && resSupply.value) {
  let rawSupply = parseInt(resSupply.value.trim())
  Supply = isNaN(rawSupply) ? '⚠️ n/a' : Math.floor(rawSupply / 100000000).toString()
}

// Bitcoin hashrate
// /1m and /1w both return { hashrates: [{avgHashrate, timestamp}, ...] }
// Use the last (most recent) entry in the array
let HashInExa = '⚠️ n/a'
if (show_hash == 1 && resHash.ok && resHash.value) {
  let arr = resHash.value.hashrates
  if (arr && arr.length > 0) {
    let rawHash = arr[arr.length - 1].avgHashrate
    let HashExa = BigInt(Math.round(rawHash).toString())
    let Exa = 10n ** 18n
    HashInExa = (HashExa / Exa).toString() + ' EH/s'
  }
}


// Difficulty adjustment
let DiffDisplay = '⚠️ n/a'
if (show_diff == 1 && resDiff.ok && resDiff.value) {
  let change  = parseFloat(resDiff.value.difficultyChange).toFixed(1)
  let rblocks = resDiff.value.remainingBlocks.toString()
  DiffDisplay = change + '% / ' + rblocks + ' blk'
}

// Status indicator: 🟢 all ok | 🟡 partial | 🔴 all failed
const now = new Date()
const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
const checks = [
  show_block  ? resHeight.ok  : null,
  show_fees   ? resFees.ok    : null,
  show_moscow ? (resMoscow.ok || resPrice.ok) : null,
  show_price  ? resPrice.ok   : null,
  show_supply ? resSupply.ok  : null,
  show_hash   ? resHash.ok    : null,
  show_diff   ? resDiff.ok    : null,
].filter(v => v !== null)
const allOk  = checks.every(v => v === true)
const noneOk = checks.every(v => v === false)
const statusIcon = noneOk ? '🔴' : allOk ? '🟢' : '🟡'

let widget = await createWidget()

// Check where the script is running
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  widget.presentLarge()
}

Script.complete()

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
  let statusLine = listwidget.addText(statusIcon + ' ' + timeStr)
  statusLine.centerAlignText()
  statusLine.font = Font.systemFont(11+scale)
  statusLine.textColor = new Color(C_DIM)

  listwidget.addSpacer(spacerSize)

  if(show_block == 1) {
    let blockTitel = listwidget.addText("Blockheight")
    blockTitel.centerAlignText()
    blockTitel.font = Font.boldSystemFont(labelFont)
    blockTitel.textColor = new Color(C_LABEL)
    let block = listwidget.addText(blockHeight)
    block.centerAlignText()
    block.font = Font.boldSystemFont(blockFont)
    block.textColor = resHeight.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
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
    fees.textColor = resFees.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  if(show_moscow == 1) {
    let moscowTitel = listwidget.addText("Moscow Time")
    moscowTitel.centerAlignText()
    moscowTitel.font = Font.boldSystemFont(labelFont)
    moscowTitel.textColor = new Color(C_LABEL)
    let moscowTime = listwidget.addText(MoscowTime)
    moscowTime.centerAlignText()
    moscowTime.font = Font.boldSystemFont(largeFont)
    moscowTime.textColor = (resMoscow.ok || resPrice.ok) ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  if(show_price == 1) {
    let shitcoinTitel = listwidget.addText(currency+"/BTC")
    shitcoinTitel.centerAlignText()
    shitcoinTitel.font = Font.boldSystemFont(labelFont)
    shitcoinTitel.textColor = new Color(C_LABEL)
    let shitcoin = listwidget.addText(Shitcoin)
    shitcoin.centerAlignText()
    shitcoin.font = Font.boldSystemFont(medFont)
    shitcoin.textColor = resPrice.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  if(show_supply == 1) {
    let supplyTitel = listwidget.addText("Supply")
    supplyTitel.centerAlignText()
    supplyTitel.font = Font.boldSystemFont(labelFont)
    supplyTitel.textColor = new Color(C_LABEL)
    let supply = listwidget.addText(Supply)
    supply.centerAlignText()
    supply.font = Font.boldSystemFont(medFont)
    supply.textColor = resSupply.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  if(show_hash == 1) {
    let hashTitel = listwidget.addText("Hashrate")
    hashTitel.centerAlignText()
    hashTitel.font = Font.boldSystemFont(labelFont)
    hashTitel.textColor = new Color(C_LABEL)
    let hash = listwidget.addText(HashInExa)
    hash.centerAlignText()
    hash.font = Font.boldSystemFont(medFont)
    hash.textColor = resHash.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  if(show_diff == 1) {
    let diffTitel = listwidget.addText("Difficulty adjustment")
    diffTitel.centerAlignText()
    diffTitel.font = Font.boldSystemFont(labelFont)
    diffTitel.textColor = new Color(C_LABEL)
    let diff = listwidget.addText(DiffDisplay)
    diff.centerAlignText()
    diff.font = Font.boldSystemFont(medFont)
    diff.textColor = resDiff.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
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
  let statusLine = listwidget.addText(statusIcon + ' ' + timeStr)
  statusLine.centerAlignText()
  statusLine.font = Font.systemFont(10+scale)
  statusLine.textColor = new Color(C_DIM)

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
    blockVal.textColor = resHeight.ok ? new Color(C_ACCENT) : new Color(C_ERROR)
  }

  // Small fixed spacer below block, tight to the rows
  listwidget.addSpacer(8)

  // Rows pushed to bottom, evenly spaced via dividers
  if (show_fees == 1)
    addRow(listwidget, "FEES  L·M·H", feesShort, resFees.ok, rowFont, labelFont)
  if (show_moscow == 1)
    addRow(listwidget, "MOSCOW", MoscowTime, resMoscow.ok || resPrice.ok, rowFont, labelFont)
  if (show_price == 1)
    addRow(listwidget, currency+"/BTC", Shitcoin, resPrice.ok, rowFont, labelFont)
  if (show_supply == 1)
    addRow(listwidget, "SUPPLY", Supply, resSupply.ok, rowFont, labelFont)
  if (show_hash == 1)
    addRow(listwidget, "HASHRATE", HashInExa, resHash.ok, rowFont, labelFont)
  if (show_diff == 1)
    addRow(listwidget, "DIFFICULTY", DiffDisplay, resHash.ok, rowFont, labelFont)

  return listwidget
}

function addRow(widget, label, value, isOk, rowFont, labelFont) {
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
  val.textColor = isOk ? new Color(C_ACCENT) : new Color(C_ERROR)
  val.rightAlignText()
  val.minimumScaleFactor = 0.7
}

function addDivider(widget) {
  let line = widget.addStack()
  line.backgroundColor = new Color(C_DIVIDER)
  line.size = new Size(0, 1)
}
