const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : err.message;
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
