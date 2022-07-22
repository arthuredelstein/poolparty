var express = require('express');
const { WebSocketServer } = require('ws');

var app = express();

app.get('/', function(req, res, next){
  console.log("hello");
  res.send("hello, welcome to events\n");
});

app.get('/yo', function(req, res, next){
  console.log("wassup hi");
  res.send("wassup hi\n");
});

app.get('/source', async function(req, res) {
  console.log('Got /source');
//  res.send("hi from /source");
  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  // Tell the client to retry every 10 seconds if connectivity is lost
  res.write('retry: 10000\n\n');
  let count = 0;
/*
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Emit', ++count);
    // Emit an SSE that contains the current 'count' as a string
    res.write(`data: ${count}\n\n`);
  }*/
});


app.listen(3501);


const wss = new WebSocketServer({ port: 3500 });

wss.on('connection', function connection(ws) {
  console.log("ws", performance.now());
  ws.on('message', function incoming(message) {
    try {
//      console.log(message.toString());
      ws.send(message);
    } catch (e) {
      console.log(e, message);
    }
  });
});

