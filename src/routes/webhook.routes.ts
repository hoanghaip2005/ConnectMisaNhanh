import { Router } from 'express';
import webhookController from '../controllers/webhook.controller';
import {
    webhookRateLimiter,
    validateWebhookRequest,
    replayProtection
} from '../middleware/security.middleware';

const router = Router();

/**
 * Webhook Routes
 * Handles incoming webhooks from Nhanh.vn
 */

/**
 * POST /api/webhooks/nhanh
 * Main webhook endpoint to receive events from Nhanh.vn
 * 
 * Security layers:
 * 1. Rate limiting (1000 req/min, skip trusted IPs)
 * 2. Request validation (event, businessId, data)
 * 3. Replay protection (chặn duplicate requests)
 * 4. Signature verification (trong controller)
 * 
 * Supported events:
 * - orderAdd: New order created
 * - orderUpdate: Order details updated
 */
router.post(
    '/nhanh',
    webhookRateLimiter,        // Layer 1: Rate limiting
    validateWebhookRequest,     // Layer 2: Request validation
    replayProtection,           // Layer 3: Replay attack protection
    (req, res) => webhookController.handleWebhook(req, res) // Layer 4: Signature + Processing
);

/**
 * GET /api/webhooks/status
 * Get webhook configuration status and information
 */
router.get('/status', (req, res) => webhookController.getWebhookStatus(req, res));

/**
 * GET /api/webhooks/health
 * Simple health check endpoint - Trả về nhanh để test connection
 */
router.get('/health', (req, res) => webhookController.healthCheck(req, res));

/**
 * POST /api/webhooks/nhanh/process-order/:orderId
 * Manually process an order and create voucher
 */
router.post('/nhanh/process-order/:orderId', (req, res) => webhookController.manualProcessOrder(req, res));

export default router;
