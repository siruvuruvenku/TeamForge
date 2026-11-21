function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }
  next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) return res.status(403).json({ error: 'You do not have permission to do that' });
    next();
  };
}

module.exports = { requireAuth, allowRoles };
