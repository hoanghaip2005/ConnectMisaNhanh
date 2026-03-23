import { Router } from 'express';
import nhanhRoutes from './nhanh.routes';
import webhookRoutes from './webhook.routes';
import transformRoutes from './transform.routes';
import amisRoutes from './amis.routes';
import mapperRoutes from './mapper.routes';
import opsApiRoutes from './ops.routes';

const router = Router();

/**
 * API Routes
 * All routes are prefixed with /api
 */

// Nhanh.vn integration routes
router.use('/nhanh', nhanhRoutes);

// Webhook routes
router.use('/webhooks', webhookRoutes);

// Transform routes (for testing)
router.use('/transform', transformRoutes);

// MISA AMIS integration routes
router.use('/amis', amisRoutes);

// Mapper routes (test mapping Nhanh -> AMIS)
router.use('/mapper', mapperRoutes);

// Operations dashboard APIs
router.use('/ops', opsApiRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString()
    });
});

export default router;
