const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING(100), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'manager', 'developer'), allowNull: false, defaultValue: 'developer' },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
});
User.beforeCreate(async (user) => { user.password = await bcrypt.hash(user.password, 12); });
User.beforeUpdate(async (user) => { if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12); });
const Project = sequelize.define('Project', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  key: { type: DataTypes.STRING(12), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'planning', 'paused', 'completed'), defaultValue: 'active' },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true }
});
const Task = sequelize.define('Task', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('backlog', 'todo', 'in_progress', 'review', 'done'), defaultValue: 'todo' },
  priority: { type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'medium' },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true }
});
const Document = sequelize.define('Document', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  content: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
  status: { type: DataTypes.ENUM('draft', 'review', 'published', 'archived'), defaultValue: 'draft' },
  version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 }
});
const Activity = sequelize.define('Activity', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  type: { type: DataTypes.STRING(60), allowNull: false },
  message: { type: DataTypes.STRING(255), allowNull: false },
  metadata: { type: DataTypes.JSON, allowNull: true }
});
const MonitoredService = sequelize.define('MonitoredService', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  url: { type: DataTypes.STRING(500), allowNull: false, validate: { isUrl: true } },
  environment: { type: DataTypes.STRING(80), defaultValue: 'production' },
  owner: { type: DataTypes.STRING(120), allowNull: true },
  status: { type: DataTypes.ENUM('unknown', 'healthy', 'unhealthy'), defaultValue: 'unknown' },
  responseTime: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  lastCheckedAt: { type: DataTypes.DATE, allowNull: true }
});
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  message: { type: DataTypes.STRING(255), allowNull: false },
  type: { type: DataTypes.STRING(60), defaultValue: 'info' },
  readAt: { type: DataTypes.DATE, allowNull: true }
});
const Revision = sequelize.define('DocumentRevision', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  content: { type: DataTypes.TEXT('long'), allowNull: false }
});

Project.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
Task.belongsTo(Project, { foreignKey: { allowNull: false } });
Task.belongsTo(User, { as: 'assignee', foreignKey: 'assigneeId' });
Document.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
Revision.belongsTo(Document, { foreignKey: { allowNull: false, onDelete: 'CASCADE' } });
Revision.belongsTo(User, { as: 'editor', foreignKey: 'editorId' });
Activity.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });
Notification.belongsTo(User, { foreignKey: { allowNull: false, onDelete: 'CASCADE' } });

module.exports = { User, Project, Task, Document, Revision, Activity, MonitoredService, Notification };
