const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const INDEX_PATH = path.join(__dirname, '..', 'index.html');

const db = new DatabaseSync(path.join(__dirname, 'ticky.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const listItems = db.prepare('SELECT id, text, done FROM items ORDER BY id');
const insertItem = db.prepare('INSERT INTO items (text) VALUES (?)');
const toggleItem = db.prepare('UPDATE items SET done = 1 - done WHERE id = ?');
const deleteItem = db.prepare('DELETE FROM items WHERE id = ?');

function allItems() {
  return listItems.all().map((i) => ({ ...i, done: !!i.done }));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(INDEX_PATH));
    }

    if (req.method === 'GET' && url.pathname === '/api/items') {
      return sendJson(res, 200, allItems());
    }

    if (req.method === 'POST' && url.pathname === '/api/items') {
      const { text } = await readJson(req);
      if (typeof text !== 'string' || !text.trim()) {
        return sendJson(res, 400, { error: 'text is required' });
      }
      insertItem.run(text.trim());
      return sendJson(res, 201, allItems());
    }

    const match = url.pathname.match(/^\/api\/items\/(\d+)(\/toggle)?$/);
    if (match) {
      const id = Number(match[1]);
      if (req.method === 'POST' && match[2]) {
        toggleItem.run(id);
        return sendJson(res, 200, allItems());
      }
      if (req.method === 'DELETE' && !match[2]) {
        deleteItem.run(id);
        return sendJson(res, 200, allItems());
      }
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`Ticky running at http://localhost:${PORT}`));
