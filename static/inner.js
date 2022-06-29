// Default websocket address
const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

const waitInterval = 0;

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
const probe = async () => {
  const consumedCount = await consumeSockets(300);
  await releaseSockets(consumedCount);
  return consumedCount;
};

// Display elements
const logDiv = document.getElementById("log");

// Update the display elements
const update = ({ consumedCount, probeFound, time }) => {
  let message = "";
  if (consumedCount !== undefined) {
    message += "last consumed: " + consumedCount;
  }
  if (probeFound !== undefined) {
    message += "probe found: " + probeFound;
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
bindCommandToButton(probeButton, () => probe(), "probeFound");
