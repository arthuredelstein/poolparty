var express = require('express');
const { WebSocketServer } = require('ws');

var app = express();

app.get('/', function(req, res, next){
  res.send("hello\n");
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

