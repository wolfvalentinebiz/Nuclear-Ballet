'use strict';

const { app, BrowserWindow, Menu, dialog } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DIST_DIR = path.join(app.getAppPath(), 'dist');
const DIST_PREFIX = DIST_DIR.endsWith(path.sep) ? DIST_DIR : `${DIST_DIR}${path.sep}`;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(message);
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url || '/', 'http://127.0.0.1').pathname,
      );
    } catch {
      sendText(response, 400, 'Bad request');
      return;
    }

    const relative = pathname.replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(DIST_DIR, relative);
    if (!filePath.startsWith(DIST_PREFIX)) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        sendText(response, 404, 'Not found');
        return;
      }

      const headers = {
        'Content-Type':
          CONTENT_TYPES[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream',
        'Content-Length': stat.size,
        'X-Content-Type-Options': 'nosniff',
      };

      response.writeHead(200, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function openGame() {
  const server = await startStaticServer();
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not determine the game server address.');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${origin}/`)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    server.close();
    app.quit();
  });

  await window.loadURL(`${origin}/`);
}

app.whenReady().then(openGame).catch((error) => {
  console.error(error);
  dialog.showErrorBox('Nuclear Ballet', `The game could not start.\n\n${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});
