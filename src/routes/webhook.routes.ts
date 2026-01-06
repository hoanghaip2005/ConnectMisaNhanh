import { Router } from 'express';
import webhookController from '../controllers/webhook.controller';

const router = Router();

/**
 * Webhook Routes
 * Handles incoming webhooks from Nhanh.vn
 */

/**
 * POST /api/webhooks/nhanh
 * Main webhook endpoint to receive events from Nhanh.vn
 * 
 * Supported events:
 * - order.created: New order created
 * - order.updated: Order details updated
 * - order.cancelled: Order cancelled
 * - order.confirmed: Order confirmed
 * - order.packed: Order packed
 * - order.shipped: Order shipped
 * - order.delivered: Order delivered
 */
router.post('/nhanh', (req, res) => webhookController.handleWebhook(req, res));

/**
 * GET /api/webhooks/status
 * Get webhook configuration status and information
 */
router.get('/status', (req, res) => webhookController.getWebhookStatus(req, res));

export default router;
