// Keep the synthetic source in a separate process, as the authenticated browser is in production.
const { WebSocket } = require('ws');
let socket;
process.on('message', message => {
  if (message.connect) {
    socket = new WebSocket(message.connect, { headers: { Origin: 'https://kyaa.io' }, handshakeTimeout: 5000 });
    socket.on('open', () => process.send('__open__'));
    socket.on('message', raw => process.send(raw.toString()));
    socket.on('error', error => { process.send(JSON.stringify({ error: error.message })); process.exit(1); });
  } else if (message.close) { socket?.close(); process.exit(0); }
  else socket.send(message);
});
process.on('disconnect', () => { socket?.close(); process.exit(0); });
