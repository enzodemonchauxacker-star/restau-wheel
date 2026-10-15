const express = require('express');
const path = require('path');
const { mount } = require('./lib/arcade-players');

const app = express();
const port = Number(process.env.ARCADE_PORT || 4180);

app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  if (
    req.path.endsWith('.html') ||
    req.path === '/' ||
    /^\/arcade\/?$/.test(req.path) ||
    /^\/arcade\/(dashboard|jouer)\/?$/.test(req.path) ||
    req.path.startsWith('/arcade/api/')
  ) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
mount(app);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log('Arcade live http://127.0.0.1:' + port);
});
