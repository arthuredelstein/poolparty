// Default websocket address
const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

const waitInterval = 0;
const kMaxValue = 128;
const stepMs = 120;
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
  await sleepMs(waitInterval);
  const nFinish = sockets.size;
  return nFinish - nStart;
};

// Release and return number deleted
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
  await sleepMs(waitInterval);
  return numberToDelete;
};

// Probe for empty slots
const probe = async (max) => {
  const consumedCount = await consumeSockets(max);
  await releaseSockets(consumedCount);
  return consumedCount;
};

const amISender = async () => {
  const found = await consumeSockets(kMaxSlots);
  return found > 128;
};

const sendIntegers = async (n) => {
  const integerList = [];
  await consumeSockets(kMaxSlots);
  const startTime = performance.now();
  let lastInteger = 0;
  for (let i = 0; i < n; ++i) {
    const integer = 1 + Math.floor(Math.random() * kMaxValue);
    integerList.push(integer - 1);
    const delta = integer - lastInteger;
    lastInteger = integer;
    console.log(delta);
    if (delta > 0) {
      await releaseSockets(delta);
    } else {
      await consumeSockets(-delta);
    }
    const remainingTime = startTime + (i + 1) * stepMs - performance.now();
    console.log("sent:", integer - 1, Date.now());
    await sleepMs(Math.max(0, remainingTime));
  }
  await consumeSockets(kMaxSlots);
  return integerList;
};

const receiveIntegers = async (n) => {
  let consumed;
  while (true) {
    consumed = await consumeSockets(1);
    if (consumed > 0) {
      break;
    }
  }
  await releaseSockets(consumed);
  console.log("start detected");
  await sleepMs(stepMs / 2);
  const integerList = [];
  const startTime = performance.now();
  for (let i = 0; i < n; ++i) {
    const integer = await probe(kMaxValue);
    integerList.push(integer - 1);
    console.log("received:", integer - 1, Date.now());
    const remainingTime = startTime + (i + 1) * stepMs - performance.now();
    console.log({ remainingTime });
    await sleepMs(remainingTime);
  }
  return integerList;
};

// Display elements
const logDiv = document.getElementById("log");

// Input elements
const commandButtonsDiv = document.getElementById("commandButtons");

// Wire up input elements:

const createButtonForCommand = (commandName, commandFunction) => {
  let button = document.createElement("button");
  button.id = "button-" + commandName.replace(" ", "-");;
  button.innerText = commandName;
  button.addEventListener("click", async (_e) => {
    const t1 = performance.now();
    const result = await commandFunction();
    const t2 = performance.now();
    const resultObject = { time: t2 - t1 };
    logDiv.innerText += `${commandName}: ${result}, time: ${t2-t1}, holding: ${sockets.size}\n`;
  });
  commandButtons.appendChild(button);
};

createButtonForCommand("consume 1", () => consumeSockets(1));
createButtonForCommand("consume all", () => consumeSockets(kMaxSlots));
createButtonForCommand("release 1", () => releaseSockets(1));
createButtonForCommand("release all", () => releaseSockets(kMaxSlots));
createButtonForCommand("probe", () => probe(kMaxSlots));
createButtonForCommand("is sender", amISender);
createButtonForCommand("send", () => sendIntegers(5));
createButtonForCommand("receive", () => receiveIntegers(5));

const t0 = performance.now();
let sender = await amISender();
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
  console.log("prep: ", t1);
  const resultList = await sendIntegers(5);
  const t2 = performance.now();
  await releaseSockets(kMaxSlots);
  logDiv.innerText += "send: " + resultList + ", time, ms: " + (t2 - t1) + "\n";
} else {
  await consumeSockets(1);
  await sleepMs(100);
  await releaseSockets(kMaxSlots);
  const t1 = performance.now();
  const resultList = await receiveIntegers(5);
  logDiv.innerText += "received: " + resultList + ", prep time, ms:" + (t1 - t0) + "\n";
}
