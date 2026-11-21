const { Sequelize } = require('sequelize');

const options = {
  logging: process.env.NODE_ENV === 'development' ? false : false,
  ...(process.env.DATABASE_URL
    ? { dialect: 'mysql', dialectOptions: { ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true } }, pool: { max: 5, min: 0, acquire: 30000, idle: 10000 } }
    : process.env.NODE_ENV === 'production'
      ? {}
      : { dialect: 'sqlite', storage: '.teamforge-dev.sqlite' })
};

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production. Configure a managed MySQL database in Vercel.');
}
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production. Configure a long random value in Vercel.');
}

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, options)
  : new Sequelize({ ...options, dialect: 'sqlite' });

let ready;
async function initializeDatabase() {
  if (!ready) ready = (async () => {
    await sequelize.authenticate();
    await sequelize.sync();
    const { User } = require('../models');
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const exists = await User.findOne({ where: { email: process.env.ADMIN_EMAIL.toLowerCase() } });
      if (!exists) await User.create({ name: process.env.ADMIN_NAME || 'TeamForge Admin', email: process.env.ADMIN_EMAIL.toLowerCase(), password: process.env.ADMIN_PASSWORD, role: 'admin' });
    }
  })();
  return ready;
}

module.exports = { sequelize, initializeDatabase };
