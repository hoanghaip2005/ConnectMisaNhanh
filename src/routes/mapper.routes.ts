import { Router } from 'express';
import { testMapOrder } from '../controllers/mapper.controllers';

const router = Router();

// Test map order từ Nhanh.vn sang AMIS voucher
router.get('/test/:orderId', testMapOrder);

export default router;
