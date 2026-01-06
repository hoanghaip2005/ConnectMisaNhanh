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
 * 1. orderAdd/orderUpdate: Order Success (status = 60)
 * 2. paymentReceived: Hoá đơn bán lẻ nhận thanh toán
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

                // Log data cho order và payment events
                if (event === 'orderAdd' || event === 'orderUpdate' || event === 'paymentReceived') {
                    console.log('Data:', JSON.stringify(data, null, 2));
                    console.log('Full body:', JSON.stringify(req.body, null, 2));
                }

                console.log('========================================');
            }

            // Xử lý các loại events
            if (event === 'paymentReceived') {
                // Xử lý hoá đơn bán lẻ nhận thanh toán
                await this.handlePaymentReceived(data);

                res.status(200).json({
                    success: true,
                    message: 'Payment received event processed',
                    processedAt: new Date().toISOString()
                });
                return;
            }

            // Chỉ xử lý order events
            if (event !== 'orderAdd' && event !== 'orderUpdate') {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[WEBHOOK] Skipping event: ${event} (not supported)`);
                }

                res.status(200).json({
                    success: true,
                    message: 'Webhook received (non-supported event)',
                    processedAt: new Date().toISOString()
                });
                return;
            }

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

            res.status(200).json({
                success: true,
                message: 'Webhook received',
                processedAt: new Date().toISOString()
            });

        } catch (error) {
            res.status(200).json({
                success: true,
                message: 'Webhook received'
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
     * Handle paymentReceived event - Hoá đơn bán lẻ nhận thanh toán
     */
    private async handlePaymentReceived(data: any): Promise<void> {
        try {
            // Parse billId từ webhook data
            // Cần xem cấu trúc thực tế của data khi nhận webhook
            let billId = data?.id || data?.billId || data?.bill?.id;

            if (!billId) {
                console.log('[WEBHOOK] paymentReceived: No billId found in webhook data');
                console.log('[WEBHOOK] Data structure:', JSON.stringify(data, null, 2));
                return;
            }

            console.log(`[WEBHOOK] Processing payment received for bill ${billId}`);

            // Lấy chi tiết hoá đơn từ Nhanh.vn
            const billsResponse = await this.nhanhService.getRetailBills({
                filters: { id: billId },
                paginator: { size: 1 }
            });

            if (!billsResponse?.data || billsResponse.data.length === 0) {
                console.error(`[WEBHOOK] Retail bill ${billId} not found`);
                return;
            }

            const bill = billsResponse.data[0];

            // Map sang format AMIS
            const voucher = amisMapperService.mapRetailBillToAmisVoucher(bill);

            // Lấy access token
            const accessToken = process.env.MISA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MISA access token not found');
            }

            // Gửi lên MISA
            const amisResponse = await amisService.saveVoucher([voucher], accessToken);

            console.log(`✅ [WEBHOOK] Retail bill ${billId} sent to MISA successfully`);
            console.log('MISA Response:', amisResponse.Data);

        } catch (error: any) {
            console.error(`[WEBHOOK] Error processing paymentReceived:`, error.message);
        }
    }

    /**
     * Get webhook status and configuration
     * GET /api/webhooks/status
     */
    public async getWebhookStatus(req: Request, res: Response): Promise<void> {
        try {
            const serverUrl = process.env.SERVER_URL || 'https://activ.ngrok.dev';
            const webhookUrl = `${serverUrl}/api/webhooks/nhanh`;

            res.status(200).json({
                success: true,
                webhookUrl,
                configured: true,
                supportedEvents: [
                    {
                        event: 'orderAdd / orderUpdate',
                        description: 'Đơn hàng thành công',
                        filters: { statuses: [60] }
                    },
                    {
                        event: 'paymentReceived',
                        description: 'Hoá đơn bán lẻ nhận thanh toán',
                        filters: {}
                    }
                ],
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

export default new WebhookController();
