// Default websocket address
const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

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
  await sleepMs(50);
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
  await sleepMs(50);
  return numberToDelete;
};

// Probe for empty slots
const probe = async () => {
  const consumedCount = await consumeSockets(300);
  await releaseSockets(consumedCount);
  return consumedCount;
};

// Display elements
const countDiv = document.getElementById("count");
const consumedDiv = document.getElementById("consumed");
const probeFoundDiv = document.getElementById("probeFound");

// Update the display elements
const update = ({ consumedCount, probeFound }) => {
  countDiv.innerText = "I hold: " + sockets.size;
  if (consumedDiv !== undefined) {
    consumedDiv.innerText = "last consumed: " + consumedCount;
  }
  if (probeFound !== undefined) {
    probeFoundDiv.innerText = "probe found: " + probeFound;
  }
};

// Input elements
const consumeOneButton = document.getElementById("consumeOne");
const consumeAllButton = document.getElementById("consumeAll");
const releaseOneButton = document.getElementById("releaseOne");
const releaseAllButton = document.getElementById("releaseAll");
const probeButton = document.getElementById("probe");

// Wire up input elements:

consumeAllButton.addEventListener("click", async (_e) => {
  const consumedCount = await consumeSockets(300);
  update({ consumedCount });
});

consumeOneButton.addEventListener("click", async (_e) => {
  const consumedCount = await consumeSockets(1);
  update({ consumedCount });
});

releaseAllButton.addEventListener("click", async (_e) => {
  const consumedCount = -await releaseSockets(300);
  update({ consumedCount });
});

releaseOneButton.addEventListener("click", async (_e) => {
  const consumedCount = -await releaseSockets(1);
  update({ consumedCount });
});

probeButton.addEventListener("click", async (_e) => {
  const probeFound = await probe();
  update({ probeFound });
});
