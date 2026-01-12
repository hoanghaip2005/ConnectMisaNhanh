import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './routes/api.routes';
import amisTokenManager from './services/amis-token-manager.services';
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

// Middleware parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiRoutes);

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
});

export default app;
