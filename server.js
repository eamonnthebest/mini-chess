const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const waiting = [];
const serverRoomState = {};

io.on('connection', (socket) => {
  console.log('connect', socket.id);
  waiting.push(socket);
  tryMatch();

  socket.on('makeMove', ({ room, from, to, promotion }) => {
    const state = serverRoomState[room];
    if (!state) return;
    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;
    const res = state.chess.move(moveObj);
    if (res) {
      io.to(room).emit('moveMade', { from, to, san: res.san, fen: state.chess.fen() });
    } else {
      socket.emit('illegal');
    }
  });

  socket.on('disconnect', () => {
    const i = waiting.indexOf(socket);
    if (i !== -1) waiting.splice(i, 1);
    for (const room of Object.keys(serverRoomState)) {
      const state = serverRoomState[room];
      if (state.players && state.players[socket.id]) {
        io.to(room).emit('opponentLeft');
        delete serverRoomState[room];
      }
    }
  });
});

function tryMatch() {
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();
    const room = `room_${a.id}_${b.id}`;
    a.join(room);
    b.join(room);
    const chess = new Chess();
    serverRoomState[room] = { chess, players: {} };
    const whiteId = Math.random() < 0.5 ? a.id : b.id;
    const blackId = whiteId === a.id ? b.id : a.id;
    serverRoomState[room].players[whiteId] = 'white';
    serverRoomState[room].players[blackId] = 'black';
    io.to(room).emit('startGame', { room, white: whiteId, black: blackId, fen: chess.fen() });
    console.log('matched', room);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('Server running on', PORT));
