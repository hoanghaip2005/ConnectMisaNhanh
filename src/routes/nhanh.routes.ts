import { Router } from 'express';
import nhanhController from '../controllers/nhanh.controllers';

const router = Router();

/**
 * Nhanh.vn OAuth Routes
 */

// Step 1: Initiate OAuth flow - Get authorization URL
// GET /api/nhanh/oauth/initiate?returnUrl=https://yourdomain.com/callback
router.get('/oauth/initiate', (req, res) => nhanhController.initiateOAuth(req, res));

// Step 2: OAuth callback - Exchange access code for token
// GET /api/nhanh/oauth/callback?accessCode=YOUR_ACCESS_CODE
router.get('/oauth/callback', (req, res) => nhanhController.handleOAuthCallback(req, res));

// Check access token validity
// POST /api/nhanh/oauth/check
// Body: { "accessToken": "...", "businessId": 123456 }
router.post('/oauth/check', (req, res) => nhanhController.checkAccessToken(req, res));

// Get current configuration (without sensitive data)
// GET /api/nhanh/config
router.get('/config', (req, res) => nhanhController.getConfig(req, res));

/**
 * Nhanh.vn Order Routes
 */

// Get order list
// POST /api/nhanh/orders
// Body: { "filters": {...}, "paginator": {...}, "dataOptions": {...} }
router.post('/orders', (req, res) => nhanhController.getOrderList(req, res));

// Get order history
// GET /api/nhanh/orders/history/:orderId
router.get('/orders/history/:orderId', (req, res) => nhanhController.getOrderHistory(req, res));

// Get retail bills
// POST /api/nhanh/bills/retail
// Body: { "filters": {...}, "paginator": {...}, "dataOptions": {...} }
router.post('/bills/retail', (req, res) => nhanhController.getRetailBills(req, res));

// Process retail bill and send to MISA
// POST /api/nhanh/bills/retail/process/:billId
router.post('/bills/retail/process/:billId', (req, res) => nhanhController.processRetailBill(req, res));

export default router;
