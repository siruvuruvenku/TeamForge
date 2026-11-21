const path = require('path');
const express = require('express');
const session = require('express-session');
const SequelizeStoreFactory = require('connect-session-sequelize');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { sequelize, initializeDatabase } = require('./config/database');
const { User, Project, Task, Document, Revision, Activity, MonitoredService, Notification } = require('./models');
const { requireAuth, allowRoles } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const SequelizeStore = SequelizeStoreFactory(session.Store);
const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions', checkExpirationInterval: 15 * 60 * 1000, expiration: 24 * 60 * 60 * 1000 });
const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), "script-src": ["'self'", "https://cdn.jsdelivr.net"], "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"], "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"] } } }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1d' }));
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
  try {
    if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected' });
  } catch { return res.status(403).json({ error: 'Invalid request origin' }); }
  next();
});
app.use(async (req, res, next) => {
  try { await initializeDatabase(); next(); } catch (error) { next(error); }
});
app.use(session({
  name: 'teamforge.sid', store: sessionStore,
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'local-development-secret-change-me'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use((req, res, next) => { res.locals.currentUser = req.session.user || null; res.locals.currentPath = req.path; next(); });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const logActivity = (type, message, actorId, metadata) => Activity.create({ type, message, actorId, metadata });
const validate = (req, res, next) => { const errors = validationResult(req); if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg, details: errors.array() }); next(); };
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

app.get('/', (req, res) => req.session.user ? res.redirect('/dashboard') : res.redirect('/login'));
app.get('/login', (req, res) => res.render('auth/login', { title: 'Sign in', error: null }));
app.get('/register', async (req, res) => res.render('auth/register', { title: 'Create account', error: null }));
app.post('/api/auth/register', authLimiter, body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Enter your name'), body('email').trim().isEmail().normalizeEmail(), body('password').isLength({ min: 10, max: 72 }).withMessage('Password must be at least 10 characters'), validate, async (req, res) => {
  const email = req.body.email.toLowerCase();
  if (await User.findOne({ where: { email } })) return res.status(409).json({ error: 'An account already uses that email' });
  const user = await User.create({ name: req.body.name, email, password: req.body.password, role: 'developer' });
  req.session.user = safeUser(user); await logActivity('user_joined', `${user.name} joined TeamForge`, user.id);
  res.status(201).json({ user: safeUser(user), redirect: '/dashboard' });
});
app.post('/api/auth/login', authLimiter, body('email').trim().isEmail().normalizeEmail(), body('password').isString().isLength({ min: 1, max: 72 }), validate, async (req, res) => {
  const user = await User.findOne({ where: { email: req.body.email.toLowerCase(), active: true } });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Email or password is incorrect' });
  req.session.regenerate((error) => { if (error) return res.status(500).json({ error: 'Could not start your session' }); req.session.user = safeUser(user); req.session.save((saveError) => saveError ? res.status(500).json({ error: 'Could not start your session' }) : res.json({ user: safeUser(user), redirect: '/dashboard' })); });
});
app.post('/api/auth/logout', requireAuth, (req, res) => req.session.destroy(() => { res.clearCookie('teamforge.sid'); res.json({ ok: true }); }));
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.session.user }));

app.get('/dashboard', requireAuth, async (req, res) => {
  const [projects, tasks, users, failedBuilds, activities, taskCounts, projectCounts, recentProjects] = await Promise.all([
    Project.count(), Task.count(), User.count({ where: { active: true } }),
    null,
    Activity.findAll({ limit: 8, order: [['createdAt', 'DESC']], include: [{ model: User, as: 'actor', attributes: ['name'] }] }),
    Task.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true }),
    Project.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true }),
    Project.findAll({ limit: 3, order: [['updatedAt', 'DESC']], include: [{ model: User, as: 'owner', attributes: ['name'] }] })
  ]);
  const taskTotal = taskCounts.reduce((sum, x) => sum + Number(x.count), 0);
  const completedTasks = Number(taskCounts.find((x) => x.status === 'done')?.count || 0);
  res.render('dashboard/index', { title: 'Overview', stats: { projects, activeProjects: Number(projectCounts.find((x) => x.status === 'active')?.count || 0), developers: users, openTasks: taskTotal - completedTasks, completedTasks, failedBuilds }, activities, taskCounts, projectCounts, recentProjects });
});

app.get('/projects', requireAuth, async (req, res) => {
  const projects = await Project.findAll({ order: [['updatedAt', 'DESC']], include: [{ model: User, as: 'owner', attributes: ['id', 'name'] }] });
  res.render('projects/index', { title: 'Projects', projects });
});
app.get('/tasks', requireAuth, async (req, res) => {
  const tasks = await Task.findAll({ order: [['updatedAt', 'DESC']], include: [{ model: Project, attributes: ['name', 'key'] }, { model: User, as: 'assignee', attributes: ['name'] }] });
  res.render('tasks/index', { title: 'Tasks', tasks, projects: await Project.findAll({ order: [['name', 'ASC']] }), users: await User.findAll({ where: { active: true }, order: [['name', 'ASC']] }) });
});
app.get('/documents', requireAuth, async (req, res) => res.render('documents/index', { title: 'Knowledge base', documents: await Document.findAll({ order: [['updatedAt', 'DESC']], include: [{ model: User, as: 'author', attributes: ['name'] }] }) }));
app.get('/monitoring', requireAuth, async (req, res) => res.render('monitoring/index', { title: 'Service health', services: await MonitoredService.findAll({ order: [['name', 'ASC']] }) }));
app.get('/pipelines', requireAuth, async (req, res) => res.render('pipelines/index', { title: 'Pipelines', configured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER) }));
app.get('/notifications', requireAuth, async (req, res) => res.render('notifications/index', { title: 'Notifications', notifications: await Notification.findAll({ where: { UserId: req.session.user.id }, order: [['createdAt', 'DESC']], limit: 50 }) }));

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const [totalProjects, totalTasks, completedTasks, activeUsers, activities] = await Promise.all([Project.count(), Task.count(), Task.count({ where: { status: 'done' } }), User.count({ where: { active: true } }), Activity.findAll({ limit: 10, order: [['createdAt', 'DESC']] })]);
  res.json({ source: 'live', stats: { totalProjects, totalTasks, completedTasks, openTasks: totalTasks - completedTasks, activeUsers }, activities });
});
app.get('/api/projects', requireAuth, async (req, res) => res.json(await Project.findAll({ order: [['updatedAt', 'DESC']] })));
app.post('/api/projects', requireAuth, allowRoles('admin', 'manager'), body('name').trim().isLength({ min: 2, max: 160 }), body('key').trim().matches(/^[A-Z][A-Z0-9]{1,11}$/).withMessage('Project key must be 2–12 uppercase letters or numbers'), body('status').optional().isIn(['active', 'planning', 'paused', 'completed']), validate, async (req, res) => {
  const project = await Project.create({ name: req.body.name, key: req.body.key, description: req.body.description || null, status: req.body.status || 'active', dueDate: req.body.dueDate || null, ownerId: req.session.user.id });
  await logActivity('project_created', `${req.session.user.name} created ${project.name}`, req.session.user.id, { projectId: project.id }); res.status(201).json(project);
});
app.get('/api/projects/:id', requireAuth, async (req, res) => { const project = await Project.findByPk(req.params.id, { include: [Task] }); return project ? res.json(project) : res.status(404).json({ error: 'Project not found' }); });
app.put('/api/projects/:id', requireAuth, allowRoles('admin', 'manager'), body('name').optional().trim().isLength({ min: 2, max: 160 }), body('status').optional().isIn(['active', 'planning', 'paused', 'completed']), validate, async (req, res) => { const project = await Project.findByPk(req.params.id); if (!project) return res.status(404).json({ error: 'Project not found' }); await project.update({ name: req.body.name ?? project.name, description: req.body.description ?? project.description, status: req.body.status ?? project.status, dueDate: req.body.dueDate ?? project.dueDate }); res.json(project); });
app.delete('/api/projects/:id', requireAuth, allowRoles('admin', 'manager'), async (req, res) => { const project = await Project.findByPk(req.params.id); if (!project) return res.status(404).json({ error: 'Project not found' }); await Task.destroy({ where: { ProjectId: project.id } }); await project.destroy(); res.json({ ok: true }); });

app.get('/api/tasks', requireAuth, async (req, res) => res.json(await Task.findAll({ include: [Project, { model: User, as: 'assignee', attributes: ['id', 'name'] }], order: [['updatedAt', 'DESC']] })));
app.post('/api/tasks', requireAuth, body('title').trim().isLength({ min: 2, max: 200 }), body('projectId').isInt({ min: 1 }), body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']), body('status').optional().isIn(['backlog', 'todo', 'in_progress', 'review', 'done']), validate, async (req, res) => { const project = await Project.findByPk(req.body.projectId); if (!project) return res.status(422).json({ error: 'Choose an existing project' }); const task = await Task.create({ title: req.body.title, description: req.body.description || null, ProjectId: project.id, assigneeId: req.body.assigneeId || null, priority: req.body.priority || 'medium', status: req.body.status || 'todo', dueDate: req.body.dueDate || null }); await logActivity('task_created', `${req.session.user.name} created “${task.title}”`, req.session.user.id, { taskId: task.id }); res.status(201).json(task); });
app.put('/api/tasks/:id', requireAuth, body('status').optional().isIn(['backlog', 'todo', 'in_progress', 'review', 'done']), body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']), validate, async (req, res) => { const task = await Task.findByPk(req.params.id); if (!task) return res.status(404).json({ error: 'Task not found' }); await task.update({ title: req.body.title ?? task.title, description: req.body.description ?? task.description, status: req.body.status ?? task.status, priority: req.body.priority ?? task.priority, dueDate: req.body.dueDate ?? task.dueDate, assigneeId: req.body.assigneeId ?? task.assigneeId }); if (req.body.status === 'done' && task.status === 'done') await logActivity('task_completed', `${req.session.user.name} completed “${task.title}”`, req.session.user.id, { taskId: task.id }); res.json(task); });
app.delete('/api/tasks/:id', requireAuth, allowRoles('admin', 'manager'), async (req, res) => { const task = await Task.findByPk(req.params.id); if (!task) return res.status(404).json({ error: 'Task not found' }); await task.destroy(); res.json({ ok: true }); });

app.get('/api/documents', requireAuth, async (req, res) => res.json(await Document.findAll({ order: [['updatedAt', 'DESC']] })));
app.post('/api/documents', requireAuth, body('title').trim().isLength({ min: 2, max: 200 }), body('content').optional().isString().isLength({ max: 60000 }), validate, async (req, res) => { const document = await Document.create({ title: req.body.title, content: req.body.content || '', status: 'draft', authorId: req.session.user.id }); await Revision.create({ DocumentId: document.id, version: 1, title: document.title, content: document.content, editorId: req.session.user.id }); res.status(201).json(document); });
app.get('/api/documents/:id', requireAuth, async (req, res) => { const document = await Document.findByPk(req.params.id, { include: [Revision] }); return document ? res.json(document) : res.status(404).json({ error: 'Document not found' }); });
app.put('/api/documents/:id', requireAuth, body('title').optional().trim().isLength({ min: 2, max: 200 }), body('content').optional().isString().isLength({ max: 60000 }), body('status').optional().isIn(['draft', 'review', 'published', 'archived']), validate, async (req, res) => { if (req.body.status && req.body.status !== 'draft' && !['admin', 'manager'].includes(req.session.user.role)) return res.status(403).json({ error: 'Manager access is required to change the document workflow status' }); const document = await Document.findByPk(req.params.id); if (!document) return res.status(404).json({ error: 'Document not found' }); const changed = req.body.title !== undefined || req.body.content !== undefined; await document.update({ title: req.body.title ?? document.title, content: req.body.content ?? document.content, status: req.body.status ?? document.status, version: changed ? document.version + 1 : document.version }); if (changed) await Revision.create({ DocumentId: document.id, version: document.version, title: document.title, content: document.content, editorId: req.session.user.id }); res.json(document); });
app.post('/api/documents/:id/publish', requireAuth, allowRoles('admin', 'manager'), async (req, res) => { const document = await Document.findByPk(req.params.id); if (!document) return res.status(404).json({ error: 'Document not found' }); await document.update({ status: 'published' }); res.json(document); });

app.post('/api/monitoring/services', requireAuth, allowRoles('admin', 'manager'), body('name').trim().isLength({ min: 2, max: 120 }), body('url').isURL({ protocols: ['http', 'https'], require_protocol: true }), validate, async (req, res) => res.status(201).json(await MonitoredService.create({ name: req.body.name, url: req.body.url, environment: req.body.environment || 'production', owner: req.body.owner || null })));
app.get('/api/monitoring/services', requireAuth, async (req, res) => res.json(await MonitoredService.findAll({ order: [['name', 'ASC']] })));
app.get('/api/monitoring/health', async (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/monitoring/metrics', requireAuth, async (req, res) => { const services = await MonitoredService.findAll(); const healthy = services.filter((s) => s.status === 'healthy').length; const averageResponseTime = services.length ? Math.round(services.reduce((n, s) => n + (s.responseTime || 0), 0) / services.length) : 0; res.json({ services: services.length, healthy, unhealthy: services.filter((s) => s.status === 'unhealthy').length, averageResponseTime }); });
app.get('/api/monitoring/check', async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const services = await MonitoredService.findAll(); const results = await Promise.all(services.map(async (service) => {
    const start = Date.now(); try { const response = await fetch(service.url, { signal: AbortSignal.timeout(5000), redirect: 'manual' }); const healthy = response.status < 500; await service.update({ status: healthy ? 'healthy' : 'unhealthy', responseTime: Date.now() - start, lastCheckedAt: new Date() }); return { id: service.id, status: healthy ? 'healthy' : 'unhealthy', responseTime: Date.now() - start }; } catch { await service.update({ status: 'unhealthy', responseTime: Date.now() - start, lastCheckedAt: new Date() }); return { id: service.id, status: 'unhealthy', responseTime: Date.now() - start }; }
  })); res.json({ checked: results.length, results });
});

app.get('/api/notifications', requireAuth, async (req, res) => res.json(await Notification.findAll({ where: { UserId: req.session.user.id }, order: [['createdAt', 'DESC']] })));
app.put('/api/notifications/:id/read', requireAuth, async (req, res) => { const notification = await Notification.findOne({ where: { id: req.params.id, UserId: req.session.user.id } }); if (!notification) return res.status(404).json({ error: 'Notification not found' }); await notification.update({ readAt: new Date() }); res.json(notification); });
app.put('/api/notifications/read-all', requireAuth, async (req, res) => { await Notification.update({ readAt: new Date() }, { where: { UserId: req.session.user.id, readAt: null } }); res.json({ ok: true }); });

app.get('/api/github/repositories', requireAuth, async (req, res) => {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER) return res.json({ source: 'demo', configured: false, items: [] });
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(process.env.GITHUB_OWNER)}/repos?sort=updated&per_page=30`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) return res.status(502).json({ error: 'GitHub API request failed' });
  const items = (await response.json()).map((r) => ({ id: r.id, name: r.name, fullName: r.full_name, url: r.html_url, private: r.private, updatedAt: r.updated_at })); res.json({ source: 'github', configured: true, items });
});
app.get('/api/pipelines', requireAuth, async (req, res) => {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER) return res.json({ source: 'demo', configured: false, runs: [] });
  const repo = req.query.repository; if (!repo || !/^[\w.-]+$/.test(repo)) return res.status(422).json({ error: 'Provide a repository name' });
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(process.env.GITHUB_OWNER)}/${encodeURIComponent(repo)}/actions/runs?per_page=30`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (!response.ok) return res.status(502).json({ error: 'GitHub Actions request failed' }); const data = await response.json(); res.json({ source: 'github', configured: true, runs: data.workflow_runs || [] });
});
app.use(notFound);
app.use(errorHandler);

module.exports = app;
