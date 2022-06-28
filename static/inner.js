const kWebSocketAddress = "wss://torpat.ch/poolparty/websockets";

// All sockets, dead or alive.
let sockets = new Set();

// Sleep for time specified by interval in ms.
const sleepMs = (interval) => new Promise(
  resolve => setTimeout(resolve, interval));

// Consume and return number consumed.
const consumeSockets = async (max) => {
  const nStart = sockets.size;
  for (let i = 0; i < max; ++i) {
    try {
      let socket = new WebSocket(kWebSocketAddress);
      socket.onerror = (e) => {
        //console.log(e);
        if (socket.readyState === 3) {
          sockets.delete(socket);
        }
      };
      sockets.add(socket);
    } catch (e) {
      console.log("something went wrong");
    }
  }
  await sleepMs(50);
  const nFinish = sockets.size;
  return nFinish - nStart;
};

// Release and return number deleted
const releaseSockets = async (max) => {
  const numberToDelete = Math.min(max, sockets.size);
  const doomedSockets = Array.from(sockets).slice(0, numberToDelete);
  for (let socket of doomedSockets) {
    socket.close();
    sockets.delete(socket);
  }
  await sleepMs(50);
  return numberToDelete;
};

const count = document.getElementById("count");
const consumeAllButton = document.getElementById("consumeAll");
const releaseAllButton = document.getElementById("releaseAll");
const consumeOneButton = document.getElementById("consumeOne");
const releaseOneButton = document.getElementById("releaseOne");
const consumed = document.getElementById("consumed");

const update = (consumedCount) => {
  count.innerText = "I hold: " + sockets.size;
  consumed.innerText = "last consumed: " + consumedCount;
};

consumeAllButton.addEventListener("click", async (e) => {
  const consumedCount = await consumeSockets(300);
  update(consumedCount);
});

consumeOneButton.addEventListener("click", async (e) => {
  const consumedCount = await consumeSockets(1);
  update(consumedCount);
});

releaseAllButton.addEventListener("click", async e => {
  const consumedCount = - await releaseSockets(300);
  update(consumedCount);
});

releaseOneButton.addEventListener("click", async e => {
  const consumedCount = - await releaseSockets(1);
  update(consumedCount);
});
