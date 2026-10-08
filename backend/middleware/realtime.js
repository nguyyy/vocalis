// realtime.js
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');

function attachDeepgramRealtime(server, deepgramKey) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/realtime') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (clientWS) => {
    console.log('[relay] client connected');

    // Build Deepgram URL with desired model/settings
    const dgUrl = new URL('wss://api.deepgram.com/v1/listen');
    dgUrl.searchParams.set('model', 'nova-3');
    dgUrl.searchParams.set('language', 'en-US');
    dgUrl.searchParams.set('smart_format', 'true');
    dgUrl.searchParams.set('interim_results', 'true');
  

    const dgWS = new WebSocket(dgUrl.toString(), {
      headers: { Authorization: `Token ${deepgramKey}` },
    });

    dgWS.on('open', () => console.log('[relay] upstream Deepgram connected'));
    dgWS.on('error', (e) => console.error('[relay] upstream error', e));
    dgWS.on('close', (code, reason) => {
      console.log('[relay] upstream closed', code, reason?.toString());
      try { clientWS.close(); } catch {}
    });

    dgWS.on('message', (data, isBinary) => {
      // Deepgram replies are text JSON; make sure we forward text, not binary
      const out = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      if (clientWS.readyState === 1) clientWS.send(out);
    });

    // Deepgram → client
    dgWS.on('message', (msg) => {
      if (clientWS.readyState === 1) clientWS.send(msg);
    });

    // client → Deepgram (raw audio chunks)
    clientWS.on('message', (data) => {
      if (dgWS.readyState === 1) dgWS.send(data);
    });

    clientWS.on('error', (e) => console.warn('[relay] client error', e));
    clientWS.on('close', () => {
      console.log('[relay] client disconnected');
      try { dgWS.close(); } catch {}
    });
  });
}

module.exports = { attachDeepgramRealtime };
