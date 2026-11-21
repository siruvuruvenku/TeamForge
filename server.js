require('dotenv').config();
const app = require('./src/app');
const { sequelize, initializeDatabase } = require('./src/config/database');

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  initializeDatabase()
    .then(() => app.listen(port, () => console.log(`TeamForge listening on ${port}`)))
    .catch((error) => {
      console.error('Database initialization failed:', error.message);
      process.exitCode = 1;
    });
}

module.exports = app;
