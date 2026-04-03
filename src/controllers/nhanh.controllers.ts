import { Request, Response } from 'express';
import nhanhService from '../services/nhanh.services';
import amisMapperService from '../services/amis-mapper.services';
import amisService from '../services/amis.services';
import retailBillSyncService from '../services/retail-bill-sync.services';
import logger from '../utils/logger';

const ORDER_STATUS_CHANGE_STEP = 7;
const SUCCESS_STATUS = 60;

/**
 * Controller for Nhanh.vn OAuth and API integration
 */
export class NhanhController {
    /**
     *            // 3. Xử lý từng hóa đơn và lập chứng từ (cả type 1 và type 2)
            const results = [];
            let successCount = 0;
            let failCount = 0;

            const accessToken = process.env.MISA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MISA access token not found');
            }

            for (const bill of bills) {itiate OAuth flow - Redirect user to Nhanh.vn authorization page
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
     * Body: { 
     *   filters: { fromDate: "2025-07-16", toDate: "2025-08-16", ... }, 
     *   paginator: { size: 50, next: { id: 100 } }, 
     *   dataOptions: {} 
     * }
     */
    public async getRetailBills(req: Request, res: Response): Promise<void> {
        try {
            const { filters, paginator, dataOptions } = req.body;

            // Validate required date parameters
            if (!filters || (!filters.fromDate && !filters.toDate)) {
                res.status(400).json({
                    success: false,
                    message: 'Missing required filters. Please provide at least fromDate or toDate in yyyy-mm-dd format'
                });
                return;
            }

            // Build request with defaults
            const request = {
                filters: filters || {},
                paginator: paginator || { size: 50 },
                dataOptions: dataOptions || {}
            };

            const billsResponse = await nhanhService.getRetailBills(request);

            if (billsResponse.code === 1) {
                const bills = billsResponse.data || [];

                // Calculate statistics
                let totalAmount = 0;
                const statusBreakdown: { [key: string]: number } = {};
                const storeBreakdown: { [key: string]: number } = {};

                bills.forEach((bill: any) => {
                    // Sum total amount (sử dụng payment.amount thay vì totalAmount)
                    const amount = parseFloat(bill.payment?.amount || 0);
                    totalAmount += amount;

                    // Count by status (nếu có field status)
                    const status = bill.status;
                    if (status !== undefined) {
                        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
                    }

                    // Count by store/depot
                    const storeId = bill.depotId || bill.storeId;
                    if (storeId) {
                        storeBreakdown[storeId] = (storeBreakdown[storeId] || 0) + 1;
                    }
                });

                res.status(200).json({
                    success: true,
                    data: bills,
                    statistics: {
                        totalBills: bills.length,
                        totalAmount: Math.round(totalAmount),
                        averageBillValue: bills.length > 0 ? Math.round(totalAmount / bills.length) : 0,
                        byStatus: statusBreakdown,
                        byStore: storeBreakdown
                    },
                    paginator: billsResponse.paginator,
                    filters: {
                        fromDate: filters.fromDate,
                        toDate: filters.toDate
                    },
                    message: 'Retail bills retrieved successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: billsResponse.messages?.join(', ') || 'Failed to get retail bills'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get retail bills'
            });
        }
    }

    /**
     * Đồng bộ hóa đơn bán lẻ hàng loạt theo ngày
     * POST /api/nhanh/bills/retail/sync
     * Body: { fromDate: "2025-01-22", toDate: "2025-01-22", autoProcess: true }
     */
    public async syncRetailBills(req: Request, res: Response): Promise<void> {
        try {
            const { fromDate, toDate, autoProcess = false } = req.body;

            if (!fromDate || !toDate) {
                res.status(400).json({
                    success: false,
                    message: 'Missing required parameters: fromDate and toDate (format: yyyy-mm-dd)'
                });
                return;
            }

            // 1. Lấy danh sách hóa đơn từ Nhanh.vn
            const billsResponse = await nhanhService.getRetailBills({
                filters: { fromDate, toDate },
                paginator: { size: 100 }, // Lấy tối đa 100 bills
                dataOptions: {}
            });

            if (billsResponse.code !== 1 || !billsResponse.data) {
                res.status(400).json({
                    success: false,
                    message: billsResponse.messages?.join(', ') || 'Failed to get retail bills'
                });
                return;
            }

            const bills = billsResponse.data;

            // 2. Nếu không autoProcess, chỉ trả về danh sách
            if (!autoProcess) {
                res.status(200).json({
                    success: true,
                    data: bills,
                    totalBills: bills.length,
                    message: `Found ${bills.length} retail bills. Set autoProcess=true to sync to MISA`
                });
                return;
            }

            // 3. Xử lý từng hóa đơn và lập chứng từ (cả type 1 và type 2)
            const results = [];
            let successCount = 0;
            let failCount = 0;

            const accessToken = process.env.MISA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MISA access token not found');
            }

            for (const bill of bills) {
                try {
                    // Map sang format AMIS
                    const voucher = await amisMapperService.mapRetailBillToAmisVoucher(bill);

                    // Gửi lên MISA
                    const amisResponse = await amisService.saveVoucher([voucher], accessToken);

                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        status: 'success',
                        voucherNo: voucher.org_refno,
                        amisResponse: amisResponse
                    });

                    successCount++;
                } catch (error: any) {
                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        status: 'failed',
                        error: error.message
                    });

                    failCount++;
                }
            }

            // 4. Trả về kết quả
            res.status(200).json({
                success: true,
                summary: {
                    totalBills: bills.length,
                    successCount,
                    failCount,
                    fromDate,
                    toDate
                },
                results,
                message: `Processed ${bills.length} bills: ${successCount} success, ${failCount} failed`
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to sync retail bills'
            });
        }
    }

    /**
     * Xử lý hoá đơn bán lẻ và gửi lên MISA
     * POST /api/nhanh/bills/retail/process/:billId
     */
    public async processRetailBill(req: Request, res: Response): Promise<void> {
        try {
            const billId = parseInt(String(req.params.billId));

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
            const voucher = await amisMapperService.mapRetailBillToAmisVoucher(bill);

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
            const orderId = parseInt(String(req.params.orderId));

            if (!orderId || isNaN(orderId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid order ID'
                });
                return;
            }

            const historyResponse = await nhanhService.getOrderHistory([orderId], {
                steps: [ORDER_STATUS_CHANGE_STEP]
            });

            if (historyResponse.code === 1) {
                const history = (historyResponse.data || [])
                    .filter((item: any) => item.orderId === orderId)
                    .sort((a: any, b: any) => b.createdAt - a.createdAt);

                const latestStatusChange = history[0] || null;
                const olderStatusChanges = history.slice(1);
                const latestIsStatus60 = latestStatusChange?.status?.new === SUCCESS_STATUS;
                const previousStatus60Count = olderStatusChanges.filter((item: any) => item.status?.new === SUCCESS_STATUS).length;
                const hasStatus60Before = previousStatus60Count > 0;
                const shouldCreateVoucher = latestIsStatus60 && !hasStatus60Before;

                const firstStatus60 = [...history]
                    .reverse()
                    .find((item: any) => item.status?.new === SUCCESS_STATUS) || null;

                res.status(200).json({
                    success: true,
                    orderId,
                    data: {
                        history,
                        analysis: {
                            filteredSteps: [ORDER_STATUS_CHANGE_STEP],
                            totalEvents: history.length,
                            latestIsStatus60,
                            previousStatus60Count,
                            hasStatus60Before,
                            shouldCreateVoucher,
                            latestStatusChange: latestStatusChange ? {
                                createdAt: new Date(latestStatusChange.createdAt * 1000).toISOString(),
                                createdBy: latestStatusChange.createdBy,
                                oldStatus: latestStatusChange.status?.old,
                                newStatus: latestStatusChange.status?.new
                            } : null,
                            firstStatus60Event: firstStatus60 ? {
                                createdAt: new Date(firstStatus60.createdAt * 1000).toISOString(),
                                createdBy: firstStatus60.createdBy,
                                oldStatus: firstStatus60.status?.old,
                                newStatus: firstStatus60.status?.new
                            } : null,
                            note: !latestStatusChange
                                ? `Không có record step ${ORDER_STATUS_CHANGE_STEP} nào → Skip`
                                : shouldCreateVoucher
                                    ? `Record step ${ORDER_STATUS_CHANGE_STEP} mới nhất có NEW=${SUCCESS_STATUS} và chưa từng có NEW=${SUCCESS_STATUS} trước đó → Sẽ tạo chứng từ`
                                    : latestIsStatus60
                                        ? `Đã có ${previousStatus60Count} record step ${ORDER_STATUS_CHANGE_STEP} cũ hơn với NEW=${SUCCESS_STATUS} → Skip (đã lập chứng từ)`
                                        : `Record step ${ORDER_STATUS_CHANGE_STEP} mới nhất không có NEW=${SUCCESS_STATUS} → Skip`
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

    /**
     * Trigger manual sync của retail bills (ngày hôm qua)
     * POST /api/nhanh/bills/retail/sync-yesterday
     */
    public async syncYesterday(req: Request, res: Response): Promise<void> {
        try {
            const result = await retailBillSyncService.syncYesterdayBills();

            if (result.success) {
                res.status(200).json({
                    success: true,
                    summary: result.summary,
                    results: result.results,
                    message: 'Sync completed successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.error || 'Sync failed'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to sync yesterday bills'
            });
        }
    }
}

export default new NhanhController();
