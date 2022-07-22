// # Pool Party Test Script
//
// Arthur Edelstein, arthuredelstein@gmail.com
//
// This script demonstrates transmission of data between
// two websites using different modes of communication,
// including websocket, sse, and worker pools.
//
// See https://arxiv.org/abs/2112.06324

// Read query parameters, inherited from top-level window
const params = new URLSearchParams(window.location.search);

// Are we debugging?
const debug = params.get("debug") === "true";

// What mode are we in? (websocket, sse, worker)
const mode = params.get("mode");

// Figure out the current browser.
const kBrowser = (() => {
  if (navigator.userAgent.indexOf("Chrome") >= 0) {
    return "Chrome";
  } else if (navigator.userAgent.indexOf("Firefox") >= 0) {
    return "Firefox";
  }
  return null;
})();

// Declare behaviors of browsers for different modes.
// Behavior type looks like:
// {
//   create(), // returns a resource
//   destroy(resource),
//   isDead(),
//   constants: {
//     listSize,
//     maxSlots,
//     maxValue,
//     pulseMs,
//     settlingTimeMs
//   }
// }
const behaviors = {
  websocket: {
    create: () => new WebSocket("wss://poolparty.privacytests.org/websockets"),
    destroy: (socket) => socket.close(),
    isDead: (socket) => socket.readyState === WebSocket.CLOSED,
    constants: {
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
        pulseMs: 350, // 500,
        settlingTimeMs: 50
      }
    }
  },
  worker: {
    create: () => {
      const worker = new Worker("worker.js");
      worker.alive = false;
      worker.onmessage = function (_event) {
        worker.alive = true;
      };
      return worker;
    },
    destroy: (worker) => worker.terminate(),
    isDead: (worker) => worker.alive === false,
    constants: {
      Chrome: {
        listSize: 5,
        maxSlots: 512,
        maxValue: 128,
        pulseMs: 1000,
        settlingTimeMs: 200
      },
      Firefox: {
        listSize: 5,
        maxSlots: 512,
        maxValue: 128,
        pulseMs: 1400,
        settlingTimeMs: 400
      }
    }
  },
  sse: {
    create: () => {
      const source = new EventSource("events/source");
      source.alive = true;
      source.onerror = () => {
        source.alive = false;
      };
      return source;
    },
    destroy: (source) => source.close(),
    isDead: (source) => !source.alive, // source.readyState === EventSource.CLOSED,
    constants: {
      Chrome: {
        listSize: 5,
        maxSlots: 1350,
        maxValue: 128,
        pulseMs: 2000,
        settlingTimeMs: 800
      },
      Firefox: {
        listSize: 5,
        maxSlots: 512,
        maxValue: 128,
        pulseMs: 1400,
        settlingTimeMs: 400
      }
    }
  },
};

// Get the behaviors for the current mode:
const { create, destroy, isDead, constants } = behaviors[mode];

// Read constants for current browser and mode:
const k = constants[kBrowser];

// The number of total bits we are transmitting between sites:
const kNumBits = k.listSize * Math.log(k.maxValue) / Math.log(2);

// All resources, dead or alive (though we try to remove
// dead resources quickly).
const resources = new Set();

// A recording of the number of resources over time.
let trace = [];

// Record an integer, timestamped.
const recordIntegerToTrace = (i) => {
  trace.push([Date.now(), i]);
};

// Record current number of resources, timestamped
const capture = () => {
  recordIntegerToTrace(resources.size);
};

// Convert a list of small integers to a big integer
const listToBigInteger = (list, listSize, maxSmallInteger) => {
  let result = 0;
  for (let i = listSize - 1; i >= 0; --i) {
    result = result * maxSmallInteger + list[i];
  }
  return result;
};

// Convert a big integer to a list of small integers
const bigIntegerToList = (bigInteger, listSize, maxSmallInteger) => {
  const list = [];
  let feed = bigInteger;
  for (let i = 0; i < listSize; ++i) {
    const remainder = feed % maxSmallInteger;
    list.push(remainder);
    feed = (feed - remainder) / maxSmallInteger;
  }
  return list;
};

// Convert a big integer to a hexadecimal string
const bigIntegerToHex = (bigInteger, numBits) => {
  const nHexDigits = Math.ceil(numBits / 4);
  return (bigInteger + Math.pow(16, nHexDigits)).toString(16).slice(1);
};

// Generate a random big integer for sending between tabs.
const randomBigInteger = (numBits) => Math.floor(Math.random() * Math.pow(2, numBits));

// Sleep for time specified by interval in ms.
const sleepMs = (interval) => new Promise(
  resolve => setTimeout(resolve, interval));

// Sleep until a time in the future relative to `Date.now()`.
const sleepUntil = async (timeMs) => {
  await sleepMs(timeMs - Date.now());
  return Date.now();
};

// Consume and return number consumed.
const consume = async (max) => {
  capture();
  const nStart = resources.size;
  for (let i = 0; i < max; ++i) {
    resources.add(create());
    capture();
  }
  await sleepMs(k.settlingTimeMs);// * max / k.maxSlots);
  for (const resource of resources) {
    if (isDead(resource)) {
      destroy(resource);
      resources.delete(resource);
      capture();
    }
  }
  const nFinish = resources.size;
  capture();
  return nFinish - nStart;
};

// Release up to max, and return number released.
const release = async (max) => {
  capture();
  if (max === 0) {
    return 0;
  }
  const numberToRelease = Math.min(max, resources.size);
  for (let i = 0; i < numberToRelease; ++i) {
    const resource = resources.values().next().value;
    destroy(resource);
    resources.delete(resource);
    capture();
  }
  await sleepMs(k.settlingTimeMs);
  capture();
  return numberToRelease;
};

// Probe for unheld slots.
const probe = async (max) => {
  const consumedCount = await consume(max);
  await release(consumedCount);
  return consumedCount;
};

// Return true if we have taken the sender role;
// false if we are a receiver.
const isSender = async () => {
  await release(resources.size);
  await consume(k.maxSlots);
  console.log(`${resources.size} vs ${k.maxSlots / 2}`);
  if (resources.size < k.maxSlots / 2) {
    await release(resources.size);
    return false;
  } else {
    return true;
  }
};

// Send a big integer.
const sendInteger = async (bigInteger, startTime) => {
  const list = bigIntegerToList(bigInteger, k.listSize, k.maxValue);
  await consume(k.maxSlots - resources.size);
  let lastInteger = 0;
  for (let i = 0; i < k.listSize; ++i) {
    await sleepUntil(startTime + (i + 1) * k.pulseMs);
    // At the beginng of each pulse, either consume
    // or release slots so that, for the rest of the pulse,
    // exactly `integer + 1` slots are unheld.
    const integer = 1 + list[i];
    if (kBrowser === "Firefox" && mode === "websocket") {
      await consume(lastInteger + 5);
      await release(integer);
    } else {
      const delta = integer - lastInteger;
      if (delta > 0) {
        await release(delta);
      } else {
        await consume(-delta);
      }
    }
    lastInteger = integer;
  }
  if (debug) {
    log(list);
  }
  // return list;
  return bigIntegerToHex(bigInteger, kNumBits);
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
  // return integerList;
  return bigIntegerToHex(listToBigInteger(integerList, k.listSize, k.maxValue), kNumBits);
};

// A div containing a log of work done
const logDiv = document.getElementById("log");

// Round to the nearest 1000th of a second and express in seconds
const roundTime = (timeMs) => Math.round(timeMs) / 1000;

// Add a message to log, included elapsed time and
// how many slots we are holding.
const log = (msg, elapsedMs) => {
  let text = roundTime(performance.now()) + " | " + msg;
  if (elapsedMs !== undefined) {
    text += `, elapsed, ms: ${Math.round(elapsedMs)}`;
  }
  text += `, holding: ${resources.size}\n`;
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
    capture();
    const t0 = await sleepUntilNextRoundInterval((1 + k.listSize) * k.pulseMs);
    capture();
    const sender = await isSender();
    if (sender) {
      const t1 = performance.now();
      const result = await sendInteger(randomBigInteger(kNumBits), t0);
      const t2 = performance.now();
      log(`send: ${result}`, t2 - t1);
    } else {
      const t1 = performance.now();
      const result = await receiveInteger(t0);
      const t2 = performance.now();
      log(`recv: ${result}`, t2 - t1);
    }
  }
  capture();
  // Release all resources
  release(resources.size);
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
  createButtonForCommand("consume 1", () => consume(1));
  createButtonForCommand("consume all", () => consume(k.maxSlots * 2));
  createButtonForCommand("release 1", () => release(1));
  createButtonForCommand("release all", () => release(resources.size));
  createButtonForCommand("probe", () => probe(k.maxSlots));
  createButtonForCommand("is sender", () => isSender());
  createButtonForCommand("send", () => sendInteger(randomBigInteger(kNumBits), 0));
  createButtonForCommand("receive", () => receiveInteger());
};

// The main program.
const main = async () => {
  if (debug) {
    createAllCommandButtons();
  } else {
    await run();
  }
};

// Run the program!
main();
