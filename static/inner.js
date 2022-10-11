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

// Read an integer parameter
const intParam = (paramName) => {
  let result = params.get(paramName);
  return result === null ? undefined : Number.parseInt(result);
};

// Are we debugging?
const debug = params.get("debug") === "true";

// What mode are we in? (websocket, sse, worker)
const mode = params.get("mode");

// Figure out the current browser.
const kBrowser = (() => {
  if (navigator.userAgent.indexOf("Edg") >= 0) {
    return "Edge";
  } else if (navigator.brave !== undefined) {
    return "Brave";
  } else if (navigator.userAgent.indexOf("Chrome") >= 0) {
    return "Chrome";
  } else if (navigator.userAgent.indexOf("Firefox") >= 0) {
    return "Firefox";
  } else if (navigator.userAgent.indexOf("Safari") >= 0) {
    return "Safari";
  }
  return null;
})();

// Declare behaviors of browsers for different modes.
// Behavior type looks like:
// {
//   create(), // returns a resource
//   destroy(resource),
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
    create: () => new Promise((resolve, reject) => {
      const socket = new WebSocket("wss://poolparty.privacytests.org/websockets");
      const timeout = window.setTimeout(() => {
  /*      if (socket.readyState === WebSocket.CLOSED) {
          reject(new Error("websocket error"));
        } else {*/
          resolve(socket);
      //  }
      }, kBrowser === "Chrome" || kBrowser === "Edge" ? 1 : 10);
      socket.onerror = () => {
        socket.close();
        clearTimeout(timeout);
        reject(new Error("websocket error"));
      };
    }),
    destroy: (socket) => new Promise(resolve => {
      if (socket.readyState === WebSocket.CLOSED) {
        resolve();
      }
      socket.addEventListener("close", resolve, { once: true });
      socket.close();
    }),
    alive: (socket) =>
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN,
    constants: {
      Chrome: {
        listSize: 5,
        maxSlots: 255,
        maxValue: 128,
        pulseMs: 100,
        negotiateMs: 100,
      },
      Edge: {
        listSize: 5,
        maxSlots: 255,
        maxValue: 128,
        pulseMs: 100,
        negotiateMs: 100,
      },
      Firefox: {
        listSize: 5,
        maxSlots: 200,
        maxValue: 128,
        pulseMs: 1000,
        negotiateMs: 2000,
      },
      Safari: {
        listSize: 5,
        maxSlots: 255,
        maxValue: 128,
        pulseMs: 800,
        negotiateMs: 1200,
      }
    }
  },
  worker: {
    create: () => new Promise((resolve, reject) => {
      const worker = new Worker("worker.js");
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("worker not responding"));
      }, 400);
      worker.onmessage = function (_event) {
        window.clearTimeout(timeout);
        resolve(worker);
      };
    }),
    destroy: (worker) => worker.terminate(),
    alive: null,
    constants: {
      Firefox: {
        listSize: 5,
        maxSlots: 512,
        maxValue: 128,
        pulseMs: 2000,
        negotiateMs: 2000,
      },
    }
  },
  sse: {
    create: () => new Promise((resolve, reject) => {
      const source = new EventSource("events/source");
      const timeout = window.setTimeout(() => {
        resolve(source);
      }, 200);
      source.onerror = () => {
        source.close();
        clearTimeout(timeout);
        reject(new Error("EventSource failed"));
      };
    }),
    alive: (source) =>
      source.readyState === EventSource.CONNECTING ||
      source.readyState === EventSource.OPEN,
    destroy: (source) => source.close(),
    constants: {
      Brave: {
        listSize: 5,
        maxSlots: 1350,
        maxValue: 128,
        pulseMs: 1000,
        negotiateMs: 3000,
      },
      Chrome: {
        listSize: 5,
        maxSlots: 1350,
        maxValue: 128,
        pulseMs: 1000,
        negotiateMs: 2000,
      },
      Edge: {
        listSize: 5,
        maxSlots: 1350,
        maxValue: 128,
        pulseMs: 1000,
        negotiateMs: 2000,
      },
      Safari: {
        listSize: 5,
        maxSlots: 512,
        maxValue: 128,
        pulseMs: 1400,
      }
    }
  }
};

// Get the behaviors for the current mode:
const { create, destroy, alive, constants } = behaviors[mode];

// Read constants for current browser and mode:
const k = constants[kBrowser];

// The number of total bits we are transmitting between sites:
const kNumBits = k.listSize * Math.log(k.maxValue) / Math.log(2);

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

// Wait until the next second begins according to
// the system clock.
const sleepUntilNextRoundInterval = async (interval) => {
  return sleepUntil(Math.ceil(Date.now() / interval) * interval);
};

// All resources, dead or alive (though we try to remove
// dead resources quickly).
const resources = new Set();

// A recording of the number of resources over time.
const trace = [];

// Record an integer, timestamped.
const recordIntegerToTrace = (i) => {
  trace.push([Date.now(), i]);
};

// Record current number of resources, timestamped
const capture = () => {
  recordIntegerToTrace(resources.size);
};

// Remove any resources that are dead (and thus won't be kept in the pool).
const sweepDead = async () => {
  const t1 = Date.now();
  console.log("sweep");
  if (alive) {
    console.log("alive exists");
    const deadResources = [...resources].filter(r => !alive(r));
    const destroyPromises = deadResources.map(r => {
      resources.delete(r);
      return destroy(r);
    });
    console.log(destroyPromises);
    await Promise.allSettled(destroyPromises);
  }
  const t2 = Date.now();
  console.log("sweep", t2 - t1);
};

// Consume up to 'max' resource slots and return number actually consumed.
const consume = async (max) => {
  capture();
  const nStart = resources.size;
  const promises = [];
  for (let i = 0; i < max; ++i) {
    promises.push(create());
  }
  for (const result of await Promise.allSettled(promises)) {
    if (result.status === "fulfilled") {
      resources.add(result.value);
    }
  }
  if (kBrowser === "Firefox") {
    await sleepMs(100);
  }
  await sweepDead();
  capture();
  return resources.size - nStart;
};

// Release up to max resource slots and return number released.
const release = async (max) => {
  capture();
  if (max === 0) {
    return 0;
  }
  const numberToRelease = Math.min(max, resources.size);
  const destroyPromises = [];
  for (let i = 0; i < numberToRelease; ++i) {
    const resource = resources.values().next().value;
    destroyPromises.push(destroy(resource));
    resources.delete(resource);
    capture();
  }
  await Promise.all(destroyPromises);
  await sweepDead();
  return numberToRelease;
};

// Probe for unheld resource slots.
const probe = async (max) => {
  await consume(max);
  return await release(resources.size);
};

const countValues = (values) => {
  const result = {};
  for (let value of values) {
    if (result[value] === undefined) {
      result[value] = 0;
    }
    ++result[value];
  }
  return result;
};

// Return true if we have taken the sender role;
// false if we are a receiver.
const isSender = async () => {
  //  await release(resources.size);
  console.log("destroyed; left is ", JSON.stringify(countValues([...resources].map(r => r.readyState))));
  console.log("resources.size:", resources.size);
  await consume(k.maxSlots * 2); // - resources.size);
  await sleepMs(k.negotiateMs / 2);
  await sweepDead();
  capture();
  console.log(`${Date.now()} ${resources.size} vs ${k.maxSlots / 2}`);
  if (resources.size < k.maxSlots / 2) {
    await release(2 * k.maxSlots);
    await sweepDead();
    return false;
  } else {
    //if (kBrowser === "Firefox") {
      //await sleepMs(00);
    await consume(k.maxSlots * 2);
    await sweepDead();
    //}
    return true;
  }
};

// Send a big integer.
const sendInteger = async (bigInteger, startTime) => {
  const list = bigIntegerToList(bigInteger, k.listSize, k.maxValue);
//  if (kBrowser === "Firefox") {
    await consume(k.maxSlots + 100);
//  }
  let lastInteger = k.maxSlots - resources.size;
  for (let i = 0; i < k.listSize; ++i) {
    await sleepUntil(startTime + k.negotiateMs + i * k.pulseMs);
    // At the beginng of each pulse, either consume
    // or release slots so that, for the rest of the pulse,
    // exactly `integer + 1` slots are unheld.
    const integer = 1 + list[i];
    if (true) { // (kBrowser === "Firefox" && mode === "websocket") {
      await consume(lastInteger);
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
   //return list;
  return bigIntegerToHex(bigInteger, kNumBits);
};

// Receive a big integer.
const receiveInteger = async (startTime) => {
  const integerList = [];
  // Read n integers by probing for
  // unheld slots.
  const offset = 0.5;
  for (let i = 0; i < k.listSize; ++i) {
    await sleepUntil(startTime + k.negotiateMs + (i + offset) * k.pulseMs);
    const integer = await probe(k.maxValue);
    console.log("probe", integer);
    if (integer > k.maxValue || integer === 0) {
      console.log("error: illegal value");
      break;
    }
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


// When page loads
const run = async () => {
  const bigIntegerList = [];
  const numCycles = intParam("cycles") ?? 10;
//  const sender = Math.random() >= 0.5;
  for (let i = 0; i < numCycles; ++i) {
    capture();
    const t0 = await sleepUntilNextRoundInterval(k.negotiateMs + k.listSize * k.pulseMs);
    capture();
    const sender = await isSender();
    if (sender) {
      const t1 = performance.now();
      const result = await sendInteger(randomBigInteger(kNumBits), t0);
      const t2 = performance.now();
      bigIntegerList.push(result);
      log(`send: ${result}`, t2 - t1);
    } else {
      const t1 = performance.now();
      const result = await receiveInteger(t0);
      const t2 = performance.now();
      bigIntegerList.push(result);
      log(`recv: ${result}`, t2 - t1);
    }
  }
  capture();
  // Release all resources
  await sleepMs(k.pulseMs);
  release(resources.size);
  console.log(JSON.stringify(trace));
  console.log("Negotiation time", k.negotiateMs);
  console.log("Pulse length", k.pulseMs);
  console.log("Cycle time", k.negotiateMs + k.listSize * k.pulseMs);
  console.log("Pool size", k.maxSlots);
  console.log(bigIntegerList.map(i => i.toString()).join(" "))
  // Get ready to post data.
  await sleepMs(3000);
  const response = await fetch("events/result", {
    method: "POST", cache: "no-cache",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bigIntegerList)});
  console.log("match:", await response.text());
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
  createButtonForCommand("status", () => resources.size);
  createButtonForCommand("readyStates", () => JSON.stringify(countValues([...resources].map(r => r.readyState))));
  createButtonForCommand("probe", () => probe(k.maxSlots));
  createButtonForCommand("is sender", () => isSender());
  createButtonForCommand("send", () => sendInteger(randomBigInteger(kNumBits), 0));
  createButtonForCommand("receive", () => receiveInteger());
};

// The main program.
const main = async () => {
  console.log("detected", kBrowser);
  window.onunload = () => release(resources.size);
  if (debug) {
    createAllCommandButtons();
  } else {
    await run();
  }
};

// Run the program!
main();
