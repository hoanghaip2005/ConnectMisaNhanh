import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './routes/api.routes';
import amisTokenManager from './services/amis-token-manager.services';

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
    res.status(200).json({
        success: true,
        message: 'Middleware Integration API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            nhanhOAuthInitiate: '/api/nhanh/oauth/initiate?returnUrl=YOUR_HTTPS_URL',
            nhanhOAuthCallback: '/api/nhanh/oauth/callback?accessCode=CODE',
            nhanhCheckToken: '/api/nhanh/oauth/check',
            nhanhConfig: '/api/nhanh/config'
        }
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
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`Server running on port ${PORT}`);
    }

    // Start AMIS token auto-refresh
    amisTokenManager.startAutoRefresh();
});

export default app;
