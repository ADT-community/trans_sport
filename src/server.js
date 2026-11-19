const express = require('express');
const bodyParser = require('body-parser');
const { router: locationRouter } = require('./routes/location');

const app = express();
app.use(bodyParser.json());

// Mount the location API under /api
app.use('/api', locationRouter);

// Simple health check endpoint
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
