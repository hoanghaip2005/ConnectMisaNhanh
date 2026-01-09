import { Request, Response } from 'express';
import crypto from 'crypto';
import { NhanhService } from '../services/nhanh.services';
import transformService from '../services/transform.services';
import amisMapperService from '../services/amis-mapper.services';
import amisService from '../services/amis.services';

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
     */
    private verifySignature(payload: string, signature: string): boolean {
        const secretKey = process.env.NHANH_WEBHOOK_SECRET;

        if (!secretKey) {
            return true;
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha256', secretKey)
                .update(payload)
                .digest('hex');

            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            );
        } catch (error) {
            return false;
        }
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
            const signature = req.headers['x-nhanh-signature'] as string;

            // DEBUG: Log toàn bộ payload từ Nhanh.vn
            if (process.env.NODE_ENV === 'development') {
                console.log('=== WEBHOOK RECEIVED FROM NHANH.VN ===');
                console.log('Event:', event);
                console.log('BusinessId:', businessId);

                // Log data cho order events
                if (event === 'orderAdd' || event === 'orderUpdate') {
                    console.log('Data:', JSON.stringify(data, null, 2));
                    console.log('Full body:', JSON.stringify(req.body, null, 2));
                }

                console.log('========================================');
            }

            // Verify signature trước khi xử lý
            if (signature) {
                const isValid = this.verifySignature(JSON.stringify(req.body), signature);
                if (!isValid) {
                    res.status(401).json({
                        success: false,
                        error: 'Invalid signature'
                    });
                    return;
                }
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
                            console.log(`[WEBHOOK] Skipping event: ${event} (not supported)`);
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
                        console.log(`[WEBHOOK] Processing order ${orderId} with status ${status}`);
                        await this.processOrderEvent(orderId, status, saleChannel);
                    } else {
                        // Không có orderId - lấy đơn mới nhất
                        console.log('[WEBHOOK] No orderId found - fetching recent orders with status 60');
                        await this.handleOrderEventWithoutId(event);
                    }

                    console.log('[WEBHOOK] Order processing completed successfully');
                } catch (error) {
                    console.error('[WEBHOOK] Error during background processing:', error);
                    // Log error nhưng không ảnh hưởng đến response đã gửi
                }
            });

        } catch (error) {
            console.error('[WEBHOOK] Error handling webhook:', error);
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
                console.log(`[WEBHOOK] Processing Shopee order ${orderId} (status 60)`);
            } else if (status === 60) {
                // Đơn hàng thành công từ kênh khác
                shouldProcess = true;
                console.log(`[WEBHOOK] Processing order ${orderId} (status 60, channel ${saleChannel || 'unknown'})`);
            }

            if (!shouldProcess) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[WEBHOOK] Order ${orderId} skipped - status: ${status}, channel: ${saleChannel}`);
                }
                return;
            }

            // Lấy chi tiết đơn hàng từ Nhanh.vn
            const orderResponse = await this.nhanhService.getOrder(orderId);

            if (!orderResponse || !orderResponse.data) {
                console.error(`[WEBHOOK] Order ${orderId} not found`);
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
                console.error(`[WEBHOOK] Order ${orderId} - Missing MISA access token`);
                return;
            }

            // Gửi lên MISA
            const result = await amisService.saveVoucher([voucher], accessToken);

            if (process.env.NODE_ENV === 'development') {
                const statusLabel = status === 60 ? 'SUCCESS' : 'SHIPPING SHOPEE';
                console.log(`[WEBHOOK ${statusLabel}] Order ${orderId} sent to MISA successfully`);
            }

        } catch (error: any) {
            console.error(`[WEBHOOK] Error processing order ${orderId}:`, error.message);
        }
    }

    /**
     * Xử lý webhook khi không có orderId (lấy đơn mới nhất)
     */
    private async handleOrderEventWithoutId(event: string): Promise<void> {
        try {
            console.log(`[WEBHOOK] ${event} without orderId - fetching recent orders with status 60`);

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
                console.log(`[WEBHOOK] Found ${ordersResponse.data.length} recent orders with status 60`);

                // Xử lý đơn mới nhất
                const latestOrder = ordersResponse.data[0];
                const orderId = latestOrder.info.id;

                await this.processOrderEvent(orderId, 60, latestOrder.channel?.saleChannel);
            } else {
                console.log('[WEBHOOK] No recent orders found with status 60');
            }

        } catch (error: any) {
            console.error(`[WEBHOOK] Error fetching recent orders:`, error.message);
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
