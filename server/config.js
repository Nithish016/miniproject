const path = require('path');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'pragya-dev-secret-change-in-production-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', 'pragya.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
  nodeEnv: process.env.NODE_ENV || 'development',
  maxUploadSize: 100 * 1024 * 1024, // 100MB
  allowedFileExts: ['.pdf', '.ppt', '.pptx', '.doc', '.docx', '.epub', '.mp4', '.webm', '.txt', '.md']
};

module.exports = config;
