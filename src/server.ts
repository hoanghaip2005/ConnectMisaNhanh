import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './routes/api.routes';
import amisTokenManager from './services/amis-token-manager.services';
import retailBillSyncService from './services/retail-bill-sync.services';
import logger from './utils/logger';

// Load config
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));

// Middleware parser with error handling
app.use(express.json({
    verify: (req, res, buf, encoding) => {
        // Store raw body for signature verification if needed
        (req as any).rawBody = buf.toString(encoding as BufferEncoding || 'utf8');
    },
    limit: '10mb'
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JSON parsing error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err && (err as any).status === 400) {
        // JSON parsing error - Log but don't expose details
        logger.warn('Invalid JSON received', {
            path: req.path,
            method: req.method,
            ip: req.ip || req.socket.remoteAddress,
            body: typeof err.body === 'string' ? err.body.substring(0, 100) : 'invalid'
        });

        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Invalid JSON format'
        });
    }
    next(err);
});

// API Routes
app.use('/api', apiRoutes);

// Block common scanner/bot paths
const blockedPaths = [
    '/_bulk',
    '/_search',
    '/api/_bulk',
    '/elasticsearch',
    '/.env',
    '/admin',
    '/wp-admin',
    '/phpmyadmin',
    '/console'
];

app.use(blockedPaths, (req, res) => {
    logger.security('Blocked scanner request', {
        path: req.path,
        method: req.method,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent')
    });

    res.status(404).json({
        success: false,
        message: 'Not found'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(200).json({
        success: true,
        message: 'Middleware Integration API',
        version: '1.0.0',
        status: 'running',
        // ❌ Only show endpoints in development
        ...(isProduction ? {} : {
            endpoints: {
                health: '/api/health',
                docs: '/api/docs'
            }
        })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Logger sẽ tự động sanitize và xử lý production/development mode
    logger.error('Request error', {
        error: err,
        path: req.path,
        method: req.method
    });

    res.status(err.status || 500).json({
        success: false,
        message: isProduction ? 'Internal server error' : err.message,
        // ❌ Only show stack in development
        ...(isProduction ? {} : {
            error: err.message,
            stack: err.stack
        })
    });
});

// Start server
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);

    // Start AMIS token auto-refresh
    amisTokenManager.startAutoRefresh();

    // Start retail bill sync cron job (runs at 16:00 daily)
    retailBillSyncService.startCronJob();
});

export default app;
