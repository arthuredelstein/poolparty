// Default websocket address
const kWebSocketAddress = "wss://poolparty.privacytests.org/websockets";

const kBrowser = (() => {
  if (navigator.userAgent.indexOf("Chrome") >= 0) {
    return "Chrome";
  } else if (navigator.userAgent.indexOf("Firefox") >= 0) {
    return "Firefox";
  }
  return null;
})();

const k = {
  Chrome: {
    listSize: 5,
    maxSlots: 255,
    maxValue: 128,
    pulseMs: 50,
    settlingTimeMs: 0
  },
  Firefox: {
    listSize: 5,
    maxSlots: 255,
    maxValue: 128,
    pulseMs: 300,
    settlingTimeMs: 50
  }
}[kBrowser];

const kNumBits = k.listSize * Math.log(k.maxValue) / Math.log(2);

const params = new URLSearchParams(window.location.search);
const debug = params.get("debug") === "true";

// All sockets, dead or alive.
const sockets = new Set();

let trace = [];

const recordStateToTrace = () => {
  trace.push([Date.now(), sockets.size]);
};

// Round to the nearest 1000th of a second and express in seconds
const roundTime = (timeMs) => Math.round(timeMs) / 1000;

// Convert a list of small integers to a big integer
const listToBigInteger = (list) => {
  let result = 0;
  for (let i = k.listSize - 1; i >= 0; --i) {
    result = result * k.maxValue + list[i];
  }
  return result;
};

// Convert a big integer to a list of small integers
const bigIntegerToList = (bigInteger) => {
  const list = [];
  let feed = bigInteger;
  for (let i = 0; i < k.listSize; ++i) {
    const remainder = feed % k.maxValue;
    list.push(remainder);
    feed = (feed - remainder) / k.maxValue;
  }
  return list;
};

// Convert a big integer to a hexadecimal string
const bigIntegerToHex = (bigInteger) => {
  const nHexDigits = Math.ceil(kNumBits / 4);
  return (bigInteger + Math.pow(16, nHexDigits)).toString(16).slice(1);
};

// Generate a random big integer for sending between tabs.
const randomBigInteger = () => Math.floor(Math.random() * Math.pow(2, kNumBits));

// Sleep for time specified by interval in ms.
const sleepMs = (interval) => new Promise(
  resolve => setTimeout(resolve, interval));

// Sleep until a time in the future relative to `Date.now()`.
const sleepUntil = async (timeMs) => {
  await sleepMs(timeMs - Date.now());
  return Date.now();
};

// Consume and return number consumed.
const consumeSockets = async (max) => {
  recordStateToTrace();
  const nStart = sockets.size;
  let limitReached = false;
  for (let i = 0; i < max; ++i) {
    if (limitReached) {
      break;
    }
    const socket = new WebSocket(kWebSocketAddress);
    socket.onerror = (_e) => {
      limitReached = true;
//      console.log(_e);
      sockets.delete(socket);
      recordStateToTrace();
    };
    sockets.add(socket);
    recordStateToTrace();
  }
  await sleepMs(k.settlingTimeMs);
  for (const socket of sockets) {
    if (socket.readyState === 3) {
      sockets.delete(socket);
    }
  }
  const nFinish = sockets.size;
  recordStateToTrace();
  return nFinish - nStart;
};

// Release and return number deleted.
const releaseSockets = async (max) => {
  recordStateToTrace();
  if (max === 0) {
    return 0;
  }
  const numberToDelete = Math.min(max, sockets.size);
  const doomedSockets = Array.from(sockets).slice(0, numberToDelete);
  for (const socket of doomedSockets) {
    socket.close();
    sockets.delete(socket);
    recordStateToTrace();
  }
  await sleepMs(k.settlingTimeMs);
  recordStateToTrace();
  return numberToDelete;
};

// Probe for unheld slots.
const probe = async (max) => {
  const consumedCount = await consumeSockets(max);
  await releaseSockets(consumedCount);
  return consumedCount;
};

// Return true if we have taken the sender role;
// false if we are a receiver.
const isSender = async () => {
  await releaseSockets(sockets.size);
  await consumeSockets(k.maxSlots);
//  console.log(`sockets.size: ${sockets.size} vs ${k.maxSlots/2}`);
  if (sockets.size < k.maxSlots / 2) {
    await releaseSockets(sockets.size);
    return false;
  } else {
    return true;
  }
};

// Send a big integer.
const sendInteger = async (bigInteger, startTime) => {
  const list = bigIntegerToList(bigInteger);
  await consumeSockets(k.maxSlots - sockets.size);
  let lastInteger = 0;
  for (let i = 0; i < k.listSize; ++i) {
    await sleepUntil(startTime + (i + 1) * k.pulseMs);
    // At the beginng of each pulse, either consume
    // or release slots so that, for the rest of the pulse,
    // exactly `integer + 1` slots are unheld.
    const integer = 1 + list[i];
    const delta = integer - lastInteger;
    lastInteger = integer;
    if (delta > 0) {
      await releaseSockets(delta);
    } else {
      await consumeSockets(-delta);
    }
  }
  if (debug) {
    log(list);
  }
    return list;
  //return bigIntegerToHex(bigInteger);
};

// Receive a big integer.
const receiveInteger = async (startTime) => {
  const integerList = [];
  // Read n integers by probing for
  // unheld slots.
  for (let i = 0; i < k.listSize; ++i) {
    await sleepUntil(startTime + (i + 1.25) * k.pulseMs);
    const integer = await probe(k.maxValue);
    integerList.push(integer - 1);
  }
  if (debug) {
    log(integerList);
  }
   return integerList;
  //return bigIntegerToHex(listToBigInteger(integerList));
};

// A div containing a log of work done
const logDiv = document.getElementById("log");

// Add a message to log, included elapsed time and
// how many slots we are holding.
const log = (msg, elapsedMs) => {
  let text = roundTime(performance.now()) + " | " + msg;
  if (elapsedMs !== undefined) {
    text += `, elapsed, ms: ${Math.round(elapsedMs)}`;
  }
  text += `, holding: ${sockets.size}\n`;
  logDiv.innerText += text;
  window.scrollBy(0, logDiv.scrollHeight);
};

// Wait until the next second begins according to
// the system clock.
const sleepUntilNextRoundInterval = async (interval) => {
  return sleepUntil(Math.ceil(Date.now() / interval) * interval);
};

// When page loads
const run = async () => {
  trace = [];
  for (let i = 0; i < 10; ++i) {
    recordStateToTrace();
    const t0 = await sleepUntilNextRoundInterval((1 + k.listSize) * k.pulseMs);
    recordStateToTrace();
    const sender = await isSender();
    if (sender) {
      const t1 = performance.now();
      const resultList = await sendInteger(randomBigInteger(), t0);
      const t2 = performance.now();
      log(`send: ${resultList}`, t2 - t1);
    } else {
      const t1 = performance.now();
      const resultList = await receiveInteger(t0);
      const t2 = performance.now();
      log(`receive: ${resultList}`, t2 - t1);
    }
  }
  recordStateToTrace();
  console.log(JSON.stringify(trace));
};

// A div containing the command buttons.
const commandButtonsDiv = document.getElementById("commandButtons");

// Create a command button wired to command.
const createButtonForCommand = (commandName, commandFunction) => {
  const button = document.createElement("button");
  button.id = "button-" + commandName.replace(" ", "-"); ;
  button.innerText = commandName;
  button.addEventListener("click", async (_e) => {
    const t1 = performance.now();
    const result = await commandFunction();
    const t2 = performance.now();
    log(`${commandName}: ${result}`, t2 - t1);
  });
  commandButtonsDiv.appendChild(button);
};

// Create all the command buttons.
const createAllCommandButtons = () => {
  createButtonForCommand("consume 1", () => consumeSockets(1));
  createButtonForCommand("consume all", () => consumeSockets(k.maxSlots * 2));
  createButtonForCommand("release 1", () => releaseSockets(1));
  createButtonForCommand("release all", () => releaseSockets(sockets.size));
  createButtonForCommand("probe", () => probe(k.maxSlots));
  createButtonForCommand("is sender", isSender);
  createButtonForCommand("send", () => sendInteger(randomBigInteger()));
  createButtonForCommand("receive", () => receiveInteger());
  createButtonForCommand("status", () => {
    let result = "";
    for (const socket of sockets) {
      result += socket.readyState;
    }
    return result;
  });
};

if (debug) {
  createAllCommandButtons();
} else {
  run();
}
