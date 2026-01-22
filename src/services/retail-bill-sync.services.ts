import cron from 'node-cron';
import nhanhService from './nhanh.services';
import amisMapperService from './amis-mapper.services';
import amisService from './amis.services';
import logger from '../utils/logger';

/**
 * Retail Bill Sync Service
 * Tự động đồng bộ hóa đơn bán lẻ từ Nhanh.vn lên MISA
 */
class RetailBillSyncService {
    private isRunning: boolean = false;

    /**
     * Khởi động cron job
     * Chạy vào 00:30 sáng hàng ngày, lấy bills của ngày hôm qua
     */
    public startCronJob(): void {
        // Cron pattern: '30 0 * * *' = 00:30 mỗi ngày
        cron.schedule('30 0 * * *', async () => {
            logger.info('🕐 Cron job started: Syncing retail bills from yesterday');
            await this.syncYesterdayBills();
        });

        logger.info('✅ Retail bill sync cron job initialized (runs at 00:30 daily)');
    }

    /**
     * Đồng bộ hóa đơn bán lẻ của ngày hôm qua
     */
    public async syncYesterdayBills(): Promise<{
        success: boolean;
        summary?: any;
        results?: any[];
        error?: string;
    }> {
        // Kiểm tra nếu đang chạy
        if (this.isRunning) {
            logger.warn('⚠️ Sync already in progress, skipping...');
            return { success: false, error: 'Sync already in progress' };
        }

        this.isRunning = true;

        try {
            // Lấy ngày hôm qua
            const yesterday = this.getYesterdayDate();

            logger.info(`📅 Syncing retail bills for date: ${yesterday}`);

            // 1. Lấy danh sách hóa đơn từ Nhanh.vn
            const billsResponse = await nhanhService.getRetailBills({
                filters: {
                    fromDate: yesterday,
                    toDate: yesterday
                },
                paginator: { size: 100 },
                dataOptions: {}
            });

            if (billsResponse.code !== 1 || !billsResponse.data) {
                const errorMsg = billsResponse.messages?.join(', ') || 'Failed to get retail bills';
                logger.error('❌ Failed to fetch retail bills', { error: errorMsg });
                return { success: false, error: errorMsg };
            }

            const bills = billsResponse.data;

            if (bills.length === 0) {
                logger.info('ℹ️ No retail bills found for yesterday');
                return {
                    success: true,
                    summary: { totalBills: 0, successCount: 0, failCount: 0, date: yesterday },
                    results: []
                };
            }

            logger.info(`📦 Found ${bills.length} retail bills to process`);

            // 2. Lấy access token
            const accessToken = process.env.MISA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MISA access token not found');
            }

            // 3. Xử lý từng hóa đơn
            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const bill of bills) {
                try {
                    logger.info(`🔄 Processing bill ${bill.id} (type=${bill.type})...`);

                    // Map sang format AMIS
                    const voucher = amisMapperService.mapRetailBillToAmisVoucher(bill);

                    // Gửi lên MISA
                    const amisResponse = await amisService.saveVoucher([voucher], accessToken);

                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        status: 'success',
                        voucherNo: voucher.org_refno
                    });

                    successCount++;
                    logger.info(`✅ Bill ${bill.id} processed successfully`);

                } catch (error: any) {
                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        status: 'failed',
                        error: error.message
                    });

                    failCount++;
                    logger.error(`❌ Failed to process bill ${bill.id}`, { error: error.message });
                }

                // Delay nhỏ giữa các request để tránh rate limit
                await this.delay(500);
            }

            // 4. Tổng kết
            const summary = {
                totalBills: bills.length,
                successCount,
                failCount,
                date: yesterday,
                syncedAt: new Date().toISOString()
            };

            logger.info('🎉 Retail bill sync completed', summary);

            return {
                success: true,
                summary,
                results
            };

        } catch (error: any) {
            logger.error('❌ Retail bill sync failed', { error: error.message });
            return { success: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Lấy ngày hôm qua theo format yyyy-mm-dd
     */
    private getYesterdayDate(): string {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const year = yesterday.getFullYear();
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test manual sync (for debugging)
     */
    public async testSync(date?: string): Promise<any> {
        const targetDate = date || this.getYesterdayDate();
        logger.info(`🧪 Manual test sync for date: ${targetDate}`);

        try {
            const billsResponse = await nhanhService.getRetailBills({
                filters: { fromDate: targetDate, toDate: targetDate },
                paginator: { size: 100 }
            });

            return {
                success: true,
                date: targetDate,
                totalBills: billsResponse.data?.length || 0,
                bills: billsResponse.data || []
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default new RetailBillSyncService();
