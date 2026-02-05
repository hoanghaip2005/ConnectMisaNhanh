import { Request, Response } from 'express';
import nhanhService from '../services/nhanh.services';
import transformService from '../services/transform.services';
import amisMapperService from '../services/amis-mapper.services';
import logger from '../utils/logger';

/**
 * Test map order từ Nhanh.vn sang AMIS voucher
 * GET /api/mapper/test/:orderId
 */
export const testMapOrder = async (req: Request, res: Response) => {
    try {
        const orderId = parseInt(String(req.params.orderId));

        // 1. Lấy order từ Nhanh.vn
        const response = await nhanhService.getOrderList({
            filters: {
                ids: [orderId]
            }
        });

        if (!response.data || response.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // 2. Transform order
        const transformedRows = await transformService.transformOrderToRows(response.data[0]);

        // 3. Map sang AMIS voucher
        const voucher = await amisMapperService.mapToAmisVoucher({
            orderId: orderId,
            data: transformedRows
        });

        res.json({
            success: true,
            orderId: orderId,
            voucher: voucher
        });
    } catch (error: any) {
        logger.error('Test map order error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
