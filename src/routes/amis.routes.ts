import { Router } from 'express';
import {
    connectToAmis,
    handleAmisCallback,
    saveVoucher,
    checkCallbackHistory,
    refreshToken,
    getCurrentToken,
    deleteVoucher
} from '../controllers/amis.controllers';

const router = Router();

// Kết nối với AMIS để lấy token
router.post('/connect', connectToAmis);

// Refresh token và lưu vào .env
router.post('/refresh-token', refreshToken);

// Lấy token hiện tại
router.get('/token', getCurrentToken);

// Callback endpoint - AMIS gọi vào để trả kết quả bất đồng bộ
router.post('/callback', handleAmisCallback);
router.get('/callback', (req, res) => {
    // GET callback - MISA có thể dùng để test endpoint
    res.status(200).json({
        success: true,
        message: 'Callback endpoint is ready',
        endpoint: 'POST /api/amis/callback'
    });
});

// Gửi chứng từ bán hàng lên AMIS
router.post('/save-voucher', saveVoucher);

// Xóa chứng từ đã gửi lên AMIS
router.delete('/delete-voucher', deleteVoucher);

// Kiểm tra lịch sử callback
router.get('/check-callback', checkCallbackHistory);

export default router;
