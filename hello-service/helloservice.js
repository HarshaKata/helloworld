const express = require('express');
const app = express();
const port = 3002;

app.get('/hello', (req, res) => {
  res.send('Hello');
});

app.listen(port, () => {
  console.log(`Hello Service listening at http://localhost:${port}`);
});