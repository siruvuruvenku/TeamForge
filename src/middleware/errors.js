function notFound(req, res) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).render('errors/not-found', { title: 'Page not found' });
}
function errorHandler(error, req, res, next) {
  console.error(error);
  const status = Number(error.status || 500);
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: status === 500 ? 'Something went wrong' : error.message });
  res.status(status).render('errors/error', { title: 'Something went wrong', message: status === 500 ? 'Please try again in a moment.' : error.message });
}
module.exports = { notFound, errorHandler };
