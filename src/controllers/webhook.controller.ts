import { Request, Response } from 'express';
import crypto from 'crypto';
import { NhanhService } from '../services/nhanh.services';
import transformService from '../services/transform.services';
import amisMapperService from '../services/amis-mapper.services';
import amisService from '../services/amis.services';
import webhookQueueService from '../services/webhook-queue.services';
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
     * Lưu vào database và xử lý background
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

            // Chỉ xử lý order events
            if (event !== 'orderAdd' && event !== 'orderUpdate') {
                res.status(200).json({
                    success: true,
                    message: 'Event not supported',
                    event
                });
                return;
            }

            // Lấy orderId
            const orderId = data?.info?.id || data?.orderId || data?.id || req.body.id || req.body.orderId;

            if (!orderId) {
                res.status(200).json({
                    success: true,
                    message: 'No orderId found in webhook'
                });
                return;
            }

            // LƯU VÀO DATABASE + CHECK DUPLICATE (< 50ms)
            const { isNew, queueId } = await webhookQueueService.enqueue({
                event,
                orderId,
                businessId,
                payload: req.body
            });

            // TRẢ VỀ RESPONSE NGAY LẬP TỨC
            res.status(200).json({
                success: true,
                message: isNew ? 'Webhook queued for processing' : 'Webhook already processed',
                orderId,
                queueId: isNew ? queueId : undefined,
                receivedAt: new Date().toISOString()
            });

            // XỬ LÝ TRONG BACKGROUND nếu là webhook mới
            if (isNew && queueId) {
                setImmediate(async () => {
                    try {
                        const status = data?.info?.status || data?.status || req.body.status;
                        const saleChannel = data?.channel?.saleChannel || data?.saleChannel || data?.sale_channel || req.body.saleChannel;

                        logger.info(`Processing order ${orderId} from queue ${queueId}`);
                        await this.processOrderEvent(orderId, status, saleChannel, queueId);

                    } catch (error: any) {
                        logger.error(`Error processing queue ${queueId}:`, error);
                        await webhookQueueService.markAsFailed(queueId, error.message);
                    }
                });
            }

        } catch (error: any) {
            logger.error('Error handling webhook', error);
            // Vẫn trả về 200 để Nhanh không gửi lại
            res.status(200).json({
                success: true,
                message: 'Webhook received but error occurred',
                error: error.message
            });
        }
    }

    /**
     * Process order events by orderId
     */
    private async processOrderEvent(orderId: number, status?: number, saleChannel?: number, queueId?: number): Promise<void> {
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
                if (queueId) {
                    await webhookQueueService.markAsFailed(queueId, 'Status not 60 or not Shopee channel');
                }
                return;
            }

            // ✅ KIỂM TRA LỊCH SỬ ĐƠN HÀNG - Tránh tạo chứng từ trùng lặp
            const isFirstTimeStatus60 = await this.checkIfFirstTimeStatus60(orderId);

            if (!isFirstTimeStatus60) {
                logger.info(`Order ${orderId} - Already processed before (not first time status 60), skipping...`);
                if (queueId) {
                    await webhookQueueService.markAsFailed(queueId, 'Not first time status 60');
                }
                return;
            }

            logger.info(`Order ${orderId} - First time reaching status 60, creating voucher...`);

            // Lấy chi tiết đơn hàng từ Nhanh.vn
            const orderResponse = await this.nhanhService.getOrder(orderId);

            if (!orderResponse || !orderResponse.data) {
                logger.error(`Order ${orderId} not found`);
                if (queueId) {
                    await webhookQueueService.markAsFailed(queueId, 'Order not found in Nhanh.vn');
                }
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
                if (queueId) {
                    await webhookQueueService.markAsFailed(queueId, 'Missing MISA access token');
                }
                return;
            }

            // Gửi lên MISA
            const result = await amisService.saveVoucher([voucher], accessToken);

            // ✅ Đánh dấu đã xử lý thành công
            if (queueId) {
                await webhookQueueService.markAsProcessed(orderId, queueId);
            }

            logger.info(`Order ${orderId} sent to MISA successfully`);

        } catch (error: any) {
            logger.error(`Error processing order ${orderId}`, error);
            if (queueId) {
                await webhookQueueService.markAsFailed(queueId, error.message);
            }
            throw error;
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
     * Kiểm tra xem đơn hàng có nên tạo chứng từ không
     * 
     * Logic: Webhook đến với status 60
     * - Bỏ qua record MỚI NHẤT (do webhook này tạo ra)
     * - Check các record CŨ HƠN: Đã có NEW=60 chưa?
     * - CHƯA có → CREATE (lần đầu)
     * - ĐÃ có → SKIP (đã lập rồi)
     * 
     * Ví dụ:
     * - History: [54→60 (latest), undefined→54] → CREATE (chỉ có 1 record NEW=60)
     * - History: [undefined→undefined (latest), 54→60, ...] → SKIP (đã có NEW=60 trước đó)
     * - History: [54→60 (latest), 56→60, ...] → SKIP (đã có NEW=60 trước đó)
     * 
     * @param orderId - ID đơn hàng
     * @returns true nếu nên tạo chứng từ, false nếu skip
     */
    private async checkIfFirstTimeStatus60(orderId: number): Promise<boolean> {
        try {
            // Lấy lịch sử thao tác đơn hàng
            const historyResponse = await this.nhanhService.getOrderHistory([orderId]);

            if (!historyResponse || !historyResponse.data || historyResponse.data.length === 0) {
                // Không có lịch sử -> CREATE (fail-safe, không bỏ sót)
                logger.info(`Order ${orderId} - No history. CREATE (fail-safe)`);
                return true;
            }

            // Sắp xếp theo thời gian giảm dần (mới nhất trước)
            const sortedHistory = historyResponse.data.sort((a: any, b: any) => b.createdAt - a.createdAt);

            // Bỏ qua record MỚI NHẤT (do webhook này tạo ra)
            // Check các record CŨ HƠN: Đã có NEW=60 chưa?
            const olderRecords = sortedHistory.slice(1);

            if (olderRecords.length === 0) {
                // Chỉ có 1 record (record mới nhất) -> Lần đầu
                logger.info(`Order ${orderId} - Only 1 record in history. CREATE (first time)`);
                return true;
            }

            const hasStatus60Before = olderRecords.some((item: any) => item.status?.new === 60);

            if (hasStatus60Before) {
                logger.info(`Order ${orderId} - Found NEW=60 in older records. SKIP (already processed)`);
                return false;
            }

            // Chưa có NEW=60 trong các record cũ hơn → CREATE
            logger.info(`Order ${orderId} - No NEW=60 in older records. CREATE voucher (first time)`);
            return true;

        } catch (error: any) {
            // Nếu lỗi → Fail-safe: CREATE (không bỏ sót đơn)
            logger.error(`Order ${orderId} - Error checking history, CREATE (fail-safe):`, error.message);
            return true;
        }
    }    /**
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

    /**
     * Manually process an order and create voucher
     * POST /api/webhooks/nhanh/process-order/:orderId
     */
    public async manualProcessOrder(req: Request, res: Response): Promise<void> {
        try {
            const orderId = parseInt(req.params.orderId);

            if (!orderId || isNaN(orderId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid order ID'
                });
                return;
            }

            logger.info(`Manual processing order ${orderId}...`);

            // Process the order (sử dụng method private đã có)
            await this.processOrderEvent(orderId, 60); // Status 60 = Thành công

            res.status(200).json({
                success: true,
                orderId,
                message: `Order ${orderId} processed successfully`
            });

        } catch (error: any) {
            logger.error(`Failed to manually process order`, { error: error.message });
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to process order'
            });
        }
    }
}

export default new WebhookController();
