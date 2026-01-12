import { Request, Response } from 'express';
import nhanhService from '../services/nhanh.services';
import amisMapperService from '../services/amis-mapper.services';
import amisService from '../services/amis.services';

/**
 * Controller for Nhanh.vn OAuth and API integration
 */
export class NhanhController {
    /**
     * Step 1: Initiate OAuth flow - Redirect user to Nhanh.vn authorization page
     * GET /api/nhanh/oauth/initiate
     */
    public async initiateOAuth(req: Request, res: Response): Promise<void> {
        try {
            const { returnUrl } = req.query;

            if (!returnUrl || typeof returnUrl !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Missing or invalid returnUrl parameter'
                });
                return;
            }

            // Validate returnUrl is HTTPS
            if (!returnUrl.startsWith('https://')) {
                res.status(400).json({
                    success: false,
                    message: 'Return URL must use HTTPS protocol'
                });
                return;
            }

            const oauthUrl = nhanhService.getOAuthUrl(returnUrl);

            res.status(200).json({
                success: true,
                data: {
                    oauthUrl,
                    message: 'Redirect user to this URL to authorize the application'
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to generate OAuth URL'
            });
        }
    }

    /**
     * Step 2: Handle OAuth callback - Receive accessCode from Nhanh.vn
     * GET /api/nhanh/oauth/callback?accessCode=...
     */
    public async handleOAuthCallback(req: Request, res: Response): Promise<void> {
        try {
            const { accessCode } = req.query;

            if (!accessCode || typeof accessCode !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Missing or invalid accessCode parameter'
                });
                return;
            }

            // Exchange accessCode for accessToken
            const tokenResponse = await nhanhService.getAccessToken(accessCode);

            if (tokenResponse.code === 1 && tokenResponse.data) {
                // ✅ SECURITY: Never expose accessToken in response
                const isProduction = process.env.NODE_ENV === 'production';

                res.status(200).json({
                    success: true,
                    data: {
                        // ❌ DO NOT return accessToken (security risk!)
                        ...(isProduction ? {} : {
                            accessToken: tokenResponse.data.accessToken  // Only in dev
                        }),
                        tokenReceived: true,
                        expiresAt: new Date(tokenResponse.data.expiredAt * 1000).toISOString(),
                        permissionsGranted: tokenResponse.data.permissions?.length || 0,
                        version: tokenResponse.data.version
                    },
                    message: 'Access token retrieved and saved successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: tokenResponse.messages?.join(', ') || 'Failed to get access token'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to exchange access code for token'
            });
        }
    }

    /**
     * Check access token validity and permissions
     * POST /api/nhanh/oauth/check
     * Body: { accessToken, businessId }
     */
    public async checkAccessToken(req: Request, res: Response): Promise<void> {
        try {
            const { accessToken, businessId } = req.body;

            if (!accessToken || !businessId) {
                res.status(400).json({
                    success: false,
                    message: 'Missing required parameters: accessToken or businessId'
                });
                return;
            }

            const checkResponse = await nhanhService.checkAccessToken(accessToken, businessId);

            if (checkResponse.code === 1 && checkResponse.data) {
                const expiredAt = checkResponse.data.expiredAt;
                const now = Math.floor(Date.now() / 1000);
                const daysRemaining = Math.floor((expiredAt - now) / 86400);

                res.status(200).json({
                    success: true,
                    data: {
                        valid: true,
                        businessId: checkResponse.data.businessId,
                        expiredAt: checkResponse.data.expiredAt,
                        expiryDate: new Date(expiredAt * 1000).toISOString(),
                        daysRemaining,
                        permissions: checkResponse.data.permissions,
                        depotIds: checkResponse.data.depotIds,
                        pageIds: checkResponse.data.pageIds,
                        version: checkResponse.data.version
                    },
                    message: `Access token is valid. Expires in ${daysRemaining} days`
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: checkResponse.messages?.join(', ') || 'Invalid access token'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to check access token'
            });
        }
    }

    /**
     * Get current configuration (safe, no sensitive data)
     * GET /api/nhanh/config
     */
    public async getConfig(req: Request, res: Response): Promise<void> {
        try {
            nhanhService.validateConfig();
            const config = nhanhService.getConfig();

            res.status(200).json({
                success: true,
                data: config
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get configuration'
            });
        }
    }

    /**
     * Get order list from Nhanh.vn
     * POST /api/nhanh/orders
     * Body: { filters, paginator, dataOptions }
     */
    public async getOrderList(req: Request, res: Response): Promise<void> {
        try {
            const { filters, paginator, dataOptions } = req.body;

            const orderResponse = await nhanhService.getOrderList({
                filters: filters || {},
                paginator: paginator || { size: 50 },
                dataOptions: dataOptions || {}
            });

            if (orderResponse.code === 1) {
                // Calculate statistics from actual order data
                const orders = orderResponse.data || [];

                // Group by status
                const statusBreakdown: { [key: string]: number } = {};
                // Group by saleChannel
                const saleChannelBreakdown: { [key: string]: number } = {};

                let totalRevenue = 0;

                orders.forEach((order: any) => {
                    // Count by status (from info.status)
                    const statusId = order.info?.status;
                    if (statusId) {
                        statusBreakdown[statusId] = (statusBreakdown[statusId] || 0) + 1;
                    }

                    // Count by saleChannel (from channel.saleChannel)
                    const channelId = order.channel?.saleChannel;
                    if (channelId) {
                        saleChannelBreakdown[channelId] = (saleChannelBreakdown[channelId] || 0) + 1;
                    }

                    // Sum revenue (from payment.codAmount)
                    const revenue = parseFloat(order.payment?.codAmount || 0);
                    totalRevenue += revenue;
                });

                res.status(200).json({
                    success: true,
                    data: orders,
                    statistics: {
                        totalOrders: orders.length,
                        totalRevenue: Math.round(totalRevenue),
                        averageOrderValue: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
                        byStatus: statusBreakdown,
                        bySaleChannel: saleChannelBreakdown
                    },
                    message: 'Order list retrieved successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: orderResponse.messages?.join(', ') || 'Failed to get order list'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get order list'
            });
        }
    }

    /**
     * Lấy danh sách hóa đơn bán lẻ
     * POST /api/nhanh/bills/retail
     */
    public async getRetailBills(req: Request, res: Response): Promise<void> {
        try {
            const response = await nhanhService.getRetailBills(req.body);

            res.status(200).json({
                success: true,
                data: response
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get retail bills'
            });
        }
    }

    /**
     * Xử lý hoá đơn bán lẻ và gửi lên MISA
     * POST /api/nhanh/bills/retail/process/:billId
     */
    public async processRetailBill(req: Request, res: Response): Promise<void> {
        try {
            const billId = parseInt(req.params.billId);

            if (!billId || isNaN(billId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid bill ID'
                });
                return;
            }

            // Lấy chi tiết hoá đơn từ Nhanh.vn
            const billsResponse = await nhanhService.getRetailBills({
                filters: { id: billId },
                paginator: { size: 1 }
            });

            if (!billsResponse?.data || billsResponse.data.length === 0) {
                res.status(404).json({
                    success: false,
                    message: `Retail bill ${billId} not found`
                });
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

            res.status(200).json({
                success: true,
                data: {
                    billId: billId,
                    voucher: voucher,
                    amisResponse: amisResponse
                },
                message: `Retail bill ${billId} processed and sent to MISA successfully`
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to process retail bill'
            });
        }
    }

    /**
     * Lấy lịch sử thao tác đơn hàng
     * GET /api/nhanh/orders/history/:orderId
     */
    public async getOrderHistory(req: Request, res: Response): Promise<void> {
        try {
            const orderId = parseInt(req.params.orderId);

            if (!orderId || isNaN(orderId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid order ID'
                });
                return;
            }

            const historyResponse = await nhanhService.getOrderHistory([orderId]);

            if (historyResponse.code === 1) {
                // Phân tích lịch sử
                const history = historyResponse.data || [];
                
                // Kiểm tra xem đã từng có status 60 chưa
                const hasStatus60Before = history.some((item: any) => 
                    item.orderId === orderId && item.status?.new === 60
                );

                // Đếm số lần chuyển sang status 60
                const status60Count = history.filter((item: any) => 
                    item.orderId === orderId && item.status?.new === 60
                ).length;

                // Tìm lần đầu tiên chuyển sang status 60 (event cuối cùng trong mảng)
                const status60Events = history.filter((item: any) => 
                    item.orderId === orderId && item.status?.new === 60
                );
                const firstStatus60 = status60Events.length > 0 ? status60Events[status60Events.length - 1] : null;

                res.status(200).json({
                    success: true,
                    orderId,
                    data: {
                        history,
                        analysis: {
                            totalEvents: history.length,
                            status60Count,
                            hasStatus60Before,
                            shouldCreateVoucher: !hasStatus60Before, // Chỉ tạo nếu chưa từng có
                            firstStatus60Event: firstStatus60 ? {
                                createdAt: new Date(firstStatus60.createdAt * 1000).toISOString(),
                                createdBy: firstStatus60.createdBy,
                                oldStatus: firstStatus60.status?.old,
                                newStatus: firstStatus60.status?.new
                            } : null,
                            note: hasStatus60Before 
                                ? `Đã từng hoàn thành ${status60Count} lần → Skip (không tạo chứng từ)`
                                : 'Chưa từng hoàn thành → Sẽ tạo chứng từ'
                        }
                    },
                    message: 'Order history retrieved successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: historyResponse.messages?.join(', ') || 'Failed to get order history'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get order history'
            });
        }
    }
}

export default new NhanhController();
