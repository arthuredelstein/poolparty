// Default websocket address
const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

const kSettlingTimeMs = 0;
const kMaxValue = 128;
const kPulseMs = 120;
const kMaxSlots = 256;

// All sockets, dead or alive.
const sockets = new Set();

// Sleep for time specified by interval in ms.
const sleepMs = (interval) => new Promise(
  resolve => setTimeout(resolve, interval));

// Consume and return number consumed.
const consumeSockets = async (max) => {
  const nStart = sockets.size;
  for (let i = 0; i < max; ++i) {
    const socket = new WebSocket(kWebSocketAddress);
    socket.onerror = (_e) => {
      // console.log(_e);
      if (socket.readyState === 3) {
        sockets.delete(socket);
      }
    };
    sockets.add(socket);
  }
  await sleepMs(kSettlingTimeMs);
  const nFinish = sockets.size;
  return nFinish - nStart;
};

// Release and return number deleted.
const releaseSockets = async (max) => {
  if (max === 0) {
    return 0;
  }
  const numberToDelete = Math.min(max, sockets.size);
  const doomedSockets = Array.from(sockets).slice(0, numberToDelete);
  for (const socket of doomedSockets) {
    socket.close();
    sockets.delete(socket);
  }
  await sleepMs(kSettlingTimeMs);
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
  const found = await consumeSockets(kMaxSlots);
  return found > 128;
};

// Send n random integers.
const sendIntegers = async (n) => {
  const integerList = [];
  await consumeSockets(kMaxSlots);
  const startTime = performance.now();
  let lastInteger = 0;
  for (let i = 0; i < n; ++i) {
    // At the beginng of each pulse, either consume
    // or release slots so that, for the rest of the pulse,
    // exactly `integer + 1` slots are unheld.
    const integer = 1 + Math.floor(Math.random() * kMaxValue);
    integerList.push(integer - 1);
    const delta = integer - lastInteger;
    lastInteger = integer;
    if (delta > 0) {
      await releaseSockets(delta);
    } else {
      await consumeSockets(-delta);
    }
    const remainingTime = startTime + (i + 1) * kPulseMs - performance.now();
    await sleepMs(Math.max(0, remainingTime));
  }
  await consumeSockets(kMaxSlots);
  return integerList;
};

// Receive n integers.
const receiveIntegers = async (n) => {
  // We assume the sender holds all slot before
  // signalling starts. Wait for any open slots
  // to appear, to indicate that signalling has begun.
  let consumed;
  while (true) {
    consumed = await consumeSockets(1);
    if (consumed > 0) {
      break;
    }
  }
  await releaseSockets(consumed);
  // Signalling has begun. Delay reading by
  // half a pulse interval so that we probe for
  // the integer in the middle of each pulse.
  await sleepMs(kPulseMs / 2);
  const integerList = [];
  const startTime = performance.now();
  // Read n integers by probing for
  // unheld slots.
  for (let i = 0; i < n; ++i) {
    const integer = await probe(kMaxValue);
    integerList.push(integer - 1);
    const remainingTime = startTime + (i + 1) * kPulseMs - performance.now();
    await sleepMs(remainingTime);
  }
  return integerList;
};

// A div containing a log of work done
const logDiv = document.getElementById("log");

// Add a message to log, included elapsed time and
// how many slots we are holding.
const log = (msg, elapsedMs) => {
  logDiv.innerText += `${msg}, elapsed, ms: ${elapsedMs}, holding: ${sockets.size}\n`;
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
  createButtonForCommand("consume all", () => consumeSockets(kMaxSlots));
  createButtonForCommand("release 1", () => releaseSockets(1));
  createButtonForCommand("release all", () => releaseSockets(kMaxSlots));
  createButtonForCommand("probe", () => probe(kMaxSlots));
  createButtonForCommand("is sender", isSender);
  createButtonForCommand("send", () => sendIntegers(5));
  createButtonForCommand("receive", () => receiveIntegers(5));
};

createAllCommandButtons();

const t0 = performance.now();
const sender = await isSender();
if (sender) {
  await consumeSockets(kMaxSlots);
  while (true) {
    await releaseSockets(1);
    const consumed = await consumeSockets(1);
    if (consumed === 0) {
      break;
    }
  }
  await sleepMs(100);
  await consumeSockets(1);
  const t1 = performance.now();
  const resultList = await sendIntegers(5);
  const t2 = performance.now();
  await releaseSockets(kMaxSlots);
  log(`send: ${resultList}`, t2 - t1);
} else {
  await consumeSockets(1);
  await sleepMs(100);
  await releaseSockets(kMaxSlots);
  const t1 = performance.now();
  const resultList = await receiveIntegers(5);
  log(`receive: ${resultList}`, t1 - t0);
}
