'use strict';

// ─── Load environment variables FIRST (before any other imports) ──────────────
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/database');
const config = require('./config/config');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { runAutoLogoutSweep } = require('./utils/autoLogoutJob');

// ─── Route imports ────────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const timesheetRoutes = require('./routes/timesheetRoutes');
const activityRoutes = require('./routes/activityRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const employeeRoutes = require('./routes/employee.routes');
const departmentRoutes = require('./routes/department.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const leaveRoutes = require('./routes/leave.routes');
const hrmsRoutes = require('./routes/hrmsRoutes'); // keeping for stats
const empRoutesSelf = require('./routes/employeeRoutes'); // self-service
const calendarRoutes = require('./routes/calendarRoutes');

// ─── Admin user controller (getTeam endpoint) ────────────────────────────────
const { getTeam } = require('./controllers/adminController');
const { authenticate } = require('./middleware/authenticate');
const { organizationIsolation } = require('./middleware/organizationIsolation');

// ─── App & HTTP server ────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 9000;

// ─── Socket.io setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  logger.info(`🔌 Socket connected: ${socket.id}`);

  socket.on('join:org', (orgId) => {
    socket.join(`org:${orgId}`);
    logger.info(`Socket ${socket.id} joined org:${orgId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Attach io to req so controllers can emit events
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: "*",
  credentials: true
}));
app.set('trust proxy', 1);

// ─── Global Rate Limiter ──────────────────────────────────────────────────────
const globalLimiter = rateLimit(config.rateLimit);
app.use('/api/', globalLimiter);

// ─── Request Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── HTTP Request Logger ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (message) => logger.http(message.trim()) },
  }));
}

app.get('/', (req, res) => {
  res.send('Backend Running');
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API running' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/overview', authenticate, organizationIsolation, require('./controllers/overviewController').getOverview);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hrms', hrmsRoutes); // for legacy/stats
app.use('/api/employee', empRoutesSelf); // for stats chart etc.
app.use('/api/calendar', calendarRoutes); // calendar day data

// Team endpoint (under /api/users)
app.get('/api/users/team', authenticate, organizationIsolation, getTeam);

// ─── 404 Handler (must be AFTER all routes) ───────────────────────────────────
app.use(notFound);

// ─── Global Error Handler (must be LAST) ─────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`🔌 Socket.io ready`);
    });

    // ── Auto-Logout Background Job ───────────────────────────────────────────
    // Runs every 5 minutes. Marks open check-ins as checked-out at 7 PM IST.
    const AUTO_LOGOUT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
      try {
        const count = await runAutoLogoutSweep();
        if (count > 0) {
          logger.info(`[AutoLogout] ✅ ${count} record(s) auto-checked-out at 7 PM IST`);
        }
      } catch (err) {
        logger.error(`[AutoLogout] ❌ Sweep failed: ${err.message}`);
      }
    }, AUTO_LOGOUT_INTERVAL_MS);
    logger.info(`⏱  Auto-logout job scheduled every ${AUTO_LOGOUT_INTERVAL_MS / 60000} min`);

  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  logger.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise} — reason: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

startServer();

module.exports = app;
