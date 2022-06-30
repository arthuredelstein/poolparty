// Default websocket address
const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

const waitInterval = 0;
const kMaxValue = 128;
const stepMs = 120;

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
  const found = await consumeSockets(300);
  return found > 128;
};

const sendIntegers = async (n) => {
  const integerList = [];
  await consumeSockets(300);
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
  await consumeSockets(300);
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

// Update the display elements
const update = ({ consumedCount, probeFound, role, sent, received, time }) => {
  let message = "";
  if (consumedCount !== undefined) {
    message += "last consumed: " + consumedCount;
  }
  if (probeFound !== undefined) {
    message += "probe found: " + probeFound;
  }
  if (role !== undefined) {
    message += "role: " + role;
  }
  if (sent !== undefined) {
    message += "sent: " + sent;
  }
  if (received !== undefined) {
    message += "received: " + received;
  }
  message += ", holding: " + sockets.size;
  if (time !== undefined) {
    message += ", time: " + time;
  }
  logDiv.innerText += message + "\n";
};

// Input elements
const consumeOneButton = document.getElementById("consumeOne");
const consumeAllButton = document.getElementById("consumeAll");
const releaseOneButton = document.getElementById("releaseOne");
const releaseAllButton = document.getElementById("releaseAll");
const probeButton = document.getElementById("probe");
const roleButton = document.getElementById("role");
const sendIntegersButton = document.getElementById("sendIntegers");
const receiveIntegersButton = document.getElementById("receiveIntegers");

// Wire up input elements:

const bindCommandToButton = (button, command, resultName) => {
  button.addEventListener("click", async (_e) => {
    const t1 = performance.now();
    const result = await command();
    const t2 = performance.now();
    const resultObject = { time: t2 - t1 };
    resultObject[resultName] = result;
    update(resultObject);
  });
};

bindCommandToButton(
  consumeOneButton,
  () => consumeSockets(1),
  "consumedCount");
bindCommandToButton(
  consumeAllButton,
  () => consumeSockets(300),
  "consumedCount");
bindCommandToButton(
  releaseOneButton,
  async () => { return -await releaseSockets(1); },
  "consumedCount");
bindCommandToButton(
  releaseAllButton,
  async () => { return -await releaseSockets(300); },
  "consumedCount");
bindCommandToButton(probeButton, () => probe(300), "probeFound");
bindCommandToButton(
  roleButton,
  async () => { return await amISender() ? "sender" : "receiver"; },
  "role");
bindCommandToButton(
  sendIntegersButton,
  () => sendIntegers(5),
  "sent");
bindCommandToButton(
  receiveIntegersButton,
  () => receiveIntegers(5),
  "received");
