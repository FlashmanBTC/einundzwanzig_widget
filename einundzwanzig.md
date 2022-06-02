# Einundzwanzig Widget

<img src="./images/einundzwanzig.jpg" style="zoom: 50%;" />

V1 Blockheight 738895
## Tutorial

1. Install the app "Scriptable" -> [Apple Appstore - Scriptable](https://apps.apple.com/ch/app/scriptable/id1405459188?l=en)
2. Open the app and click the "+" sign on the top right corner
3. Paste the following script created by [FlashmanBTC](https://twitter.com/FlashmanBTC):
4. You can edit scale if you have a smaller device. Tested it with iPhone 11 Pro and iPhone SE 2020

```js

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: bolt;
// Einundzwanzig Edition by FlashmanBTC

// Font scaling for smaller displays
// Scale  0 = iPhone 11 Pro
// Scale -4 = iPhone SE 2020
scale = 0

// Request data
let req_logo = new Request('https://i.ibb.co/MSSJYtq/Einundzwanzig-logo.png');
let req_height = new Request('https://mempool.space/api/blocks/tip/height');
let req_fees = new Request('https://mempool.space/api/v1/fees/recommended');
let req_moscow = new Request('https://bitcoinexplorer.org/api/price/usd/sats');
let req_shitcoin = new Request('https://bitcoinexplorer.org/api/price/usd');
let req_supply = new Request('https://bitcoinexplorer.org/api/blockchain/coins');

let Einundzwanzig = await req_logo.loadImage();
let blockHeight = await req_height.loadString();
let Fees = await req_fees.loadJSON();
let MoscowTime = await req_moscow.loadString();
let ShitcoinUSD = await req_shitcoin.loadString();
let Supply = await req_supply.loadString();

let position_block = blockHeight.length-3;
let position_moscow = MoscowTime.length-2;

let delimiter_block = " ";
let delimiter_moscow = ":";

blockHeight = [blockHeight.slice(0, position_block), delimiter_block, blockHeight.slice(position_block)].join('');

fast = Fees.fastestFee.toString();
halfHour = Fees.halfHourFee.toString();
hour = Fees.hourFee.toString();

MoscowTime = [MoscowTime.slice(0, position_moscow), delimiter_moscow, MoscowTime.slice(position_moscow)].join('');

let widget = await createWidget();

// Check where the script is running
if (config.runsInWidget) {
  // Runs inside a widget so add it to the homescreen widget
  Script.setWidget(widget);
} else {
  // Show the medium widget inside the app
  widget.presentLarge();
}

Script.complete();

async function createWidget() {
  // Create new empty ListWidget instance
  let listwidget = new ListWidget();
  // Refresh widget  
  let nextRefresh = Date.now() + 1000*60 
  listwidget.refreshAfterDate = new Date(nextRefresh)

  // Set new background color
  listwidget.backgroundColor = new Color("#151515");

  // Einundzwanzig Logo
  let Einundzwanzig_Logo = listwidget.addImage(Einundzwanzig).centerAlignImage();
  let Spacer = listwidget.addSpacer(14)
  
  // Blockheight
  let blockTitel = listwidget.addText("Blockheight");
  blockTitel.centerAlignText();
  blockTitel.font = Font.boldSystemFont(16+scale);
  blockTitel.textColor = new Color("#FFFFFF")
  let block = listwidget.addText(blockHeight);
  block.centerAlignText();
  block.font = Font.boldSystemFont(40+scale);
  block.textColor = new Color("#F7931A")

  // Mempool Fees
  let feesTitel = listwidget.addText("Mempool Fees");
  feesTitel.centerAlignText();
  feesTitel.font = Font.boldSystemFont(16+scale);
  feesTitel.textColor = new Color("#FFFFFF")	 
  let fees = listwidget.addText(fast + " H | " + halfHour + " M | " + hour + " L");
  fees.centerAlignText();
  if(fast < 10)
    fees.font = Font.boldSystemFont(40+scale);
  else if(fast < 100)
     fees.font = Font.boldSystemFont(36+scale);
  else
    fees.font = Font.boldSystemFont(30+scale);
  fees.textColor = new Color("#F7931A")

  // Moscow Time
  let moscowTitel = listwidget.addText("Moscow Time");
  moscowTitel.centerAlignText();
  moscowTitel.font = Font.boldSystemFont(16+scale);
  moscowTitel.textColor = new Color("#FFFFFF")	
  let moscowTime = listwidget.addText(MoscowTime);
  moscowTime.centerAlignText();
  moscowTime.font = Font.boldSystemFont(32+scale);
  moscowTime.textColor = new Color("#F7931A")
  
  // Shitcoin/BTC
  let shitcoinTitel = listwidget.addText("USD/BTC");
  shitcoinTitel.centerAlignText();
  shitcoinTitel.font = Font.boldSystemFont(16+scale);
  shitcoinTitel.textColor = new Color("#FFFFFF")	
  let shitcoin = listwidget.addText(ShitcoinUSD);
  shitcoin.centerAlignText();
  shitcoin.font = Font.boldSystemFont(24+scale);
  shitcoin.textColor = new Color("#F7931A")
  
  // Bitcoin supply
  let supplyTitel = listwidget.addText("Supply");
  supplyTitel.centerAlignText();
  supplyTitel.font = Font.boldSystemFont(16+scale);
  supplyTitel.textColor = new Color("#FFFFFF")	
  let supply = listwidget.addText(Supply);
  supply.centerAlignText();
  supply.font = Font.boldSystemFont(24+scale);
  supply.textColor = new Color("#F7931A")
  
  // Return the created widget
  return listwidget;
}
```

5. Click on the bottom left corner the "sliders" to name your script. For example: Einundzwanzig
6. Click close and done
7. Go to the homescreen, press and hold for a few seconds to make the icons move. Tab on the top left corner the "+" symbol

<img src="./images/add_widget.jpg" style="zoom: 20%;" />

7. Scroll down untill you find the "Scriptable" App. Select it and scroll to the right for the full sized version.

<img src="./images/search_widget.jpg" style="zoom: 20%;" />

8. Click "Add Widget" and tab the new created widget to edit it. Select the created script and you're done :D

<img src="./images/create_widget.png" style="zoom: 20%;" />

<img src="./images/add_script.jpg" style="zoom: 20%;" />
