import { Request, Response } from 'express';
import { NhanhService } from '../services/nhanh.services';
import transformService from '../services/transform.services';

/**
 * Transform Controller
 * Test endpoints để xem kết quả transform data
 */
class TransformController {
    private nhanhService: NhanhService;

    constructor() {
        this.nhanhService = new NhanhService();
    }

    /**
     * Transform đơn hàng theo ID
     * GET /api/transform/order/:id
     */
    public async transformById(req: Request, res: Response): Promise<void> {
        try {
            const orderId = parseInt(String(req.params.id));

            if (!orderId || isNaN(orderId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid order ID'
                });
                return;
            }

            // Fetch order by ID
            const orders = await this.nhanhService.getOrderList({
                filters: {
                    ids: [orderId]
                }
            });

            if (!orders.data || orders.data.length === 0) {
                res.status(404).json({
                    success: false,
                    message: `Order not found with ID: ${orderId}`
                });
                return;
            }

            // Transform đơn hàng
            const order = orders.data[0];
            const flattenedRows = transformService.transformOrderToRows(order);

            res.status(200).json({
                success: true,
                orderId: orderId,
                totalProductRows: flattenedRows.length,
                orderInfo: {
                    id: order.info?.id,
                    createdAt: order.info?.createdDateTime,
                    customerName: order.shippingAddress?.name,
                    totalRevenue: order.payment?.codAmount
                },
                data: flattenedRows
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Export CSV cho 1 đơn hàng theo ID
     * GET /api/transform/order/:id/csv
     */
    public async exportOrderCSV(req: Request, res: Response): Promise<void> {
        try {
            const orderId = parseInt(String(req.params.id));

            if (!orderId || isNaN(orderId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid order ID'
                });
                return;
            }

            // Fetch order by ID
            const orders = await this.nhanhService.getOrderList({
                filters: {
                    ids: [orderId]
                }
            });

            if (!orders.data || orders.data.length === 0) {
                res.status(404).send('Order not found');
                return;
            }

            const order = orders.data[0];
            const flattenedRows = transformService.transformOrderToRows(order);
            const csvData = transformService.exportToCSV(flattenedRows);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="order_${orderId}_${Date.now()}.csv"`);
            res.send('\uFEFF' + csvData); // Add BOM for Excel UTF-8

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Test transform với đơn hàng status 60
     * GET /api/transform/test-success
     */
    public async testSuccessOrders(req: Request, res: Response): Promise<void> {
        try {
            const orders = await this.nhanhService.getOrderList({
                filters: {
                    statuses: [60]
                }
            });

            if (!orders.data || orders.data.length === 0) {
                res.status(200).json({
                    success: true,
                    message: 'No orders found with status 60',
                    data: []
                });
                return;
            }

            // Transform sang dạng bảng phẳng
            const flattenedRows = transformService.transformOrders(orders.data);

            res.status(200).json({
                success: true,
                totalOrders: orders.data.length,
                totalProductRows: flattenedRows.length,
                data: flattenedRows
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Test transform với đơn hàng Shopee đang chuyển
     * GET /api/transform/test-shipping-shopee
     */
    public async testShippingShopee(req: Request, res: Response): Promise<void> {
        try {
            const orders = await this.nhanhService.getOrderList({
                filters: {
                    statuses: [59],
                    saleChannels: [42]
                }
            });

            if (!orders.data || orders.data.length === 0) {
                res.status(200).json({
                    success: true,
                    message: 'No orders found with status 59 and channel 42',
                    data: []
                });
                return;
            }

            // Transform sang dạng bảng phẳng
            const flattenedRows = transformService.transformOrders(orders.data);

            res.status(200).json({
                success: true,
                totalOrders: orders.data.length,
                totalProductRows: flattenedRows.length,
                data: flattenedRows
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Export CSV format
     * GET /api/transform/export-csv?type=success|shipping
     */
    public async exportCSV(req: Request, res: Response): Promise<void> {
        try {
            const type = req.query.type as string || 'success';

            let orders;
            if (type === 'shipping') {
                orders = await this.nhanhService.getOrderList({
                    filters: {
                        statuses: [59],
                        saleChannels: [42]
                    }
                });
            } else {
                orders = await this.nhanhService.getOrderList({
                    filters: {
                        statuses: [60]
                    }
                });
            }

            if (!orders.data || orders.data.length === 0) {
                res.status(200).send('No data available');
                return;
            }

            const flattenedRows = transformService.transformOrders(orders.data);
            const csvData = transformService.exportToCSV(flattenedRows);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="orders_${type}_${Date.now()}.csv"`);
            res.send('\uFEFF' + csvData); // Add BOM for Excel UTF-8

        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

export default new TransformController();
