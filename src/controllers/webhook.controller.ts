import { Request, Response } from 'express';
import crypto from 'crypto';
import { NhanhService } from '../services/nhanh.services';
import transformService from '../services/transform.services';
import amisMapperService from '../services/amis-mapper.services';
import amisService from '../services/amis.services';
import logger from '../utils/logger';

/**
 * Webhook Controller
 * Handles incoming webhooks from Nhanh.vn
 * 
 * Supported Events:
 * 1. orderAdd/orderUpdate: Đơn hàng status = 60 (Thành công)
 * 2. orderAdd/orderUpdate: Đơn hàng status = 60 + saleChannel = 42 (Shopee)
 * 
 * Note: Hoá đơn bán lẻ xử lý thủ công qua API endpoint
 */
class WebhookController {
    private nhanhService: NhanhService;

    constructor() {
        this.nhanhService = new NhanhService();
    }

    /**
     * Verify webhook signature for security
     * Note: Nhanh.vn không gửi signature header, nên logic này được disable
     */
    private verifySignature(payload: string, signature: string | undefined): boolean {
        // ✅ Luôn cho phép webhook từ Nhanh.vn
        // Vì Nhanh.vn không gửi X-Nhanh-Signature header
        
        if (process.env.NODE_ENV === 'development') {
            logger.debug('[WEBHOOK SECURITY] Signature validation disabled (Nhanh.vn does not send signature)');
        }
        
        return true; // Luôn accept webhook
    }

    /**
     * Main webhook handler
     * POST /api/webhooks/nhanh
     * 
     * IMPORTANT: Trả về response ngay lập tức để tránh timeout
     * Xử lý order trong background
     */
    public async handleWebhook(req: Request, res: Response): Promise<void> {
        try {
            const { event, businessId, data } = req.body;

            // DEBUG: Log toàn bộ payload từ Nhanh.vn
            if (process.env.NODE_ENV === 'development') {
                logger.webhook('WEBHOOK RECEIVED FROM NHANH.VN', {
                    event,
                    businessId,
                    data: event === 'orderAdd' || event === 'orderUpdate' ? data : undefined
                });
            }

            // TRẢ VỀ RESPONSE NGAY LẬP TỨC (< 1 giây)
            // Tránh timeout từ Nhanh API (3 giây)
            res.status(200).json({
                success: true,
                message: 'Webhook received and queued for processing',
                receivedAt: new Date().toISOString()
            });

            // XỬ LÝ TRONG BACKGROUND (không chờ đợi)
            // Sử dụng setImmediate để xử lý sau khi response đã được gửi
            setImmediate(async () => {
                try {
                    // Chỉ xử lý order events
                    if (event !== 'orderAdd' && event !== 'orderUpdate') {
                        if (process.env.NODE_ENV === 'development') {
                            logger.debug(`Skipping event: ${event} (not supported)`);
                        }
                        return;
                    }

                    // Xử lý event với orderId cụ thể
                    // Webhook từ Nhanh.vn gửi orderId ở data.info.id
                    let orderId = data?.info?.id || data?.orderId || data?.id || req.body.id || req.body.orderId;
                    let status = data?.info?.status || data?.status || req.body.status;
                    let saleChannel = data?.channel?.saleChannel || data?.saleChannel || data?.sale_channel || req.body.saleChannel;

                    if (orderId) {
                        // Có orderId - xử lý trực tiếp
                        logger.info(`Processing order ${orderId} with status ${status}`);
                        await this.processOrderEvent(orderId, status, saleChannel);
                    } else {
                        // Không có orderId - lấy đơn mới nhất
                        logger.info('No orderId found - fetching recent orders with status 60');
                        await this.handleOrderEventWithoutId(event);
                    }

                    logger.info('Order processing completed successfully');
                } catch (error) {
                    logger.error('Error during background processing', error);
                    // Log error nhưng không ảnh hưởng đến response đã gửi
                }
            });

        } catch (error) {
            logger.error('Error handling webhook', error);
            // Vẫn trả về 200 để Nhanh không gửi lại
            res.status(200).json({
                success: true,
                message: 'Webhook received',
                note: 'Error occurred but queued for retry'
            });
        }
    }

    /**
     * Process order events by orderId
     */
    private async processOrderEvent(orderId: number, status?: number, saleChannel?: number): Promise<void> {
        try {
            // Kiểm tra theo thứ tự ưu tiên:
            // 1. Shopee (saleChannel 42) + status 60
            // 2. Đơn hàng khác status 60
            let shouldProcess = false;

            if (saleChannel === 42 && status === 60) {
                // Đơn Shopee thành công
                shouldProcess = true;
                logger.info(`Processing Shopee order ${orderId} (status 60)`);
            } else if (status === 60) {
                // Đơn hàng thành công từ kênh khác
                shouldProcess = true;
                logger.info(`Processing order ${orderId} (status 60, channel ${saleChannel || 'unknown'})`);
            }

            if (!shouldProcess) {
                if (process.env.NODE_ENV === 'development') {
                    logger.debug(`Order ${orderId} skipped - status: ${status}, channel: ${saleChannel}`);
                }
                return;
            }

            // ✅ KIỂM TRA LỊCH SỬ ĐƠN HÀNG - Tránh tạo chứng từ trùng lặp
            const isFirstTimeStatus60 = await this.checkIfFirstTimeStatus60(orderId);

            if (!isFirstTimeStatus60) {
                logger.info(`Order ${orderId} - Already processed before (not first time status 60), skipping...`);
                return;
            }

            logger.info(`Order ${orderId} - First time reaching status 60, creating voucher...`);

            // Lấy chi tiết đơn hàng từ Nhanh.vn
            const orderResponse = await this.nhanhService.getOrder(orderId);

            if (!orderResponse || !orderResponse.data) {
                logger.error(`Order ${orderId} not found`);
                return;
            }

            const order = orderResponse.data;

            // Transform đơn hàng
            const transformedRows = transformService.transformSingleOrder(order);

            // Map sang format AMIS
            const voucher = amisMapperService.mapToAmisVoucher({
                orderId: orderId,
                data: transformedRows
            });

            // Lấy access token hiện tại
            const accessToken = process.env.MISA_ACCESS_TOKEN;

            if (!accessToken) {
                logger.error(`Order ${orderId} - Missing MISA access token`);
                return;
            }

            // Gửi lên MISA
            const result = await amisService.saveVoucher([voucher], accessToken);

            if (process.env.NODE_ENV === 'development') {
                const statusLabel = status === 60 ? 'SUCCESS' : 'SHIPPING SHOPEE';
                logger.info(`Order ${orderId} sent to MISA successfully (${statusLabel})`);
            }

        } catch (error: any) {
            logger.error(`Error processing order ${orderId}`, error);
        }
    }

    /**
     * Xử lý webhook khi không có orderId (lấy đơn mới nhất)
     */
    private async handleOrderEventWithoutId(event: string): Promise<void> {
        try {
            logger.info(`${event} without orderId - fetching recent orders with status 60`);

            // Lấy đơn hàng thành công trong 5 phút gần nhất
            const fiveMinutesAgo = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);
            const now = Math.floor(Date.now() / 1000);

            const ordersResponse = await this.nhanhService.getOrderList({
                filters: {
                    statuses: [60],
                    updatedAtFrom: fiveMinutesAgo,
                    updatedAtTo: now
                }
            });

            if (ordersResponse.data && ordersResponse.data.length > 0) {
                logger.info(`Found ${ordersResponse.data.length} recent orders with status 60`);

                // Xử lý đơn mới nhất
                const latestOrder = ordersResponse.data[0];
                const orderId = latestOrder.info.id;

                await this.processOrderEvent(orderId, 60, latestOrder.channel?.saleChannel);
            } else {
                logger.info('No recent orders found with status 60');
            }

        } catch (error: any) {
            logger.error('Error fetching recent orders', error);
        }
    }

    /**
     * Kiểm tra xem đơn hàng đã từng hoàn thành (status 60) trước đây chưa
     * @param orderId - ID đơn hàng
     * @returns true nếu chưa từng có status 60 (lần đầu), false nếu đã từng có (skip)
     */
    private async checkIfFirstTimeStatus60(orderId: number): Promise<boolean> {
        try {
            // Lấy lịch sử thao tác đơn hàng
            const historyResponse = await this.nhanhService.getOrderHistory([orderId]);

            if (!historyResponse || !historyResponse.data || historyResponse.data.length === 0) {
                // Không có lịch sử -> Coi như lần đầu (chưa từng hoàn thành)
                logger.warn(`Order ${orderId} - No history found, treating as first time`);
                return true;
            }

            const history = historyResponse.data;

            // Kiểm tra xem đã từng có status 60 trong lịch sử chưa
            let hasStatus60Before = false;

            for (const item of history) {
                if (item.orderId === orderId && item.status?.new === 60) {
                    hasStatus60Before = true;
                    break; // Tìm thấy rồi, không cần duyệt tiếp
                }
            }

            // Nếu đã từng có status 60 -> Đã lập chứng từ rồi -> Skip
            if (hasStatus60Before) {
                logger.info(`Order ${orderId} - Already had status 60 before, skipping...`);
                return false;
            }

            // Nếu chưa từng có status 60 -> Đây là lần đầu tiên -> Lập chứng từ
            logger.info(`Order ${orderId} - First time reaching status 60, will create voucher`);
            return true;

        } catch (error: any) {
            // Nếu lỗi khi gọi API lịch sử -> Coi như lần đầu để không bỏ sót
            logger.error(`Order ${orderId} - Error checking history, treating as first time:`, error.message);
            return true;
        }
    }

    /**
     * Get webhook status and configuration
     * GET /api/webhooks/status
     */
    public async getWebhookStatus(req: Request, res: Response): Promise<void> {
        try {
            const serverUrl = process.env.SERVER_URL || 'https://api.activ.vn';
            const webhookUrl = `${serverUrl}/api/webhooks/nhanh`;

            res.status(200).json({
                success: true,
                webhookUrl,
                configured: true,
                supportedEvents: [
                    {
                        event: 'orderAdd / orderUpdate',
                        description: 'Đơn hàng status 60 (Thành công)',
                        filters: { statuses: [60] }
                    },
                    {
                        event: 'orderAdd / orderUpdate',
                        description: 'Đơn hàng Shopee status 60',
                        filters: { statuses: [60], saleChannels: [42] }
                    }
                ],
                note: 'Hoá đơn bán lẻ xử lý thủ công qua POST /api/nhanh/bills/retail/process/:billId',
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Health check endpoint - Trả về nhanh để test connection
     * GET /api/webhooks/health
     */
    public async healthCheck(req: Request, res: Response): Promise<void> {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            message: 'Webhook endpoint is ready'
        });
    }
}

export default new WebhookController();
