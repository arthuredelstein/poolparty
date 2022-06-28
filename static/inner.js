const kWebSocketAddress = "wss://torpat.ch/pool-party/websockets";

// All sockets, dead or alive.
let sockets = new Set();

// Sleep for time specified by interval in ms.
const sleepMs = (interval) => new Promise(
  resolve => setTimeout(resolve, interval));

// Consume and count socket slots.
const countAvailableSockets = async (max) => {
  let errorCount = 0;
  for (let i = 0; i < 300; ++i) {
    try {
      let socket = new WebSocket("wss://torpat.ch/pool-party/websockets");
      socket.onerror = (e) => ++errorCount;
      sockets.add(socket);
    } catch (e) {
      console.log("huh");
    }
  }
  await sleepMs(50);
  return max - errorCount;
};

/*const consumSockets = async(n) => {
  for (let i = 0; i < n; ++i) {
    try {
*/

const dumpDeadSockets = () => {
  for (let socket of Array.from(sockets)) {
    console.log(socket.readyState);
    if (socket.readyState === 3) {
      sockets.delete(socket);
    }
  }
}

const closeAllSockets = async () => {
  dumpDeadSockets();
  console.log(sockets);
  for (let socket of Array.from(sockets)) {
    socket.close();
    console.log("closed");
    sockets.delete(socket);
  }
  console.log(sockets);
}

const resultsDiv = document.getElementById("results");


resultsDiv.innerText = "";
for (let i = 0; i < 3; ++i) {
  const numberFound = await countAvailableSockets(300);
  console.log(numberFound);
//  closeAllSockets();
  await sleepMs(50);
  console.log("done.");
  resultsDiv.innerText += numberFound + "\n";
};
