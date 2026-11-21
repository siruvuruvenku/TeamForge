require('dotenv').config();
const { initializeDatabase, sequelize } = require('../src/config/database');
initializeDatabase()
  .then(() => console.log('TeamForge database schema is ready.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => sequelize.close());
