import { Router } from 'express';
import transformController from '../controllers/transform.controllers';

const router = Router();

/**
 * Transform Routes
 * Test endpoints để xem kết quả transform data
 */

// Transform đơn hàng theo ID
router.get('/order/:id', (req, res) => transformController.transformById(req, res));

// Export CSV cho 1 đơn hàng theo ID
router.get('/order/:id/csv', (req, res) => transformController.exportOrderCSV(req, res));

// Test transform đơn hàng thành công (status 60)
router.get('/test-success', (req, res) => transformController.testSuccessOrders(req, res));

// Test transform đơn hàng Shopee đang chuyển (status 59, channel 42)
router.get('/test-shipping-shopee', (req, res) => transformController.testShippingShopee(req, res));

// Export CSV
router.get('/export-csv', (req, res) => transformController.exportCSV(req, res));

export default router;
