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
     * Chạy vào 16:05 chiều hàng ngày, lấy bills từ 16:00 ngày hôm qua đến 16:00 hôm nay
     * 
     * VD: Ngày 28/1 lúc 16:05 → Lấy bills từ 27/1 16:00 đến 28/1 16:00
     * 
     * Logic:
     * - API Nhanh chỉ hỗ trợ filter theo ngày (yyyy-mm-dd), không có giờ
     * - Cần lấy cả 2 ngày (27/1 và 28/1) rồi filter theo createdAt timestamp
     */
    public startCronJob(): void {
        // Cron pattern: '5 16 * * *' = 16:05 mỗi ngày
        cron.schedule('5 16 * * *', async () => {
            logger.info('🕐 Cron job started: Syncing retail bills (yesterday 16:00 to today 16:00)');
            await this.syncLast24Hours();
        });

        logger.info('✅ Retail bill sync cron job initialized (runs at 16:05 daily)');
    }

    /**
     * Đồng bộ hóa đơn bán lẻ trong 24 giờ gần nhất (từ 16:00 hôm qua đến 16:00 hôm nay)
     * 
     * Logic:
     * 1. Lấy bills của 2 ngày (hôm qua và hôm nay)
     * 2. Filter theo createdAt timestamp (từ yesterday 16:00 đến today 16:00)
     */
    public async syncLast24Hours(): Promise<{
        success: boolean;
        summary?: any;
        results?: any[];
        error?: string;
    }> {
        if (this.isRunning) {
            logger.warn('⚠️ Sync already in progress, skipping...');
            return { success: false, error: 'Sync already in progress' };
        }

        this.isRunning = true;

        try {
            // Tính timestamp: hôm qua 16:00 và hôm nay 16:00 (THEO GIỜ VIỆT NAM UTC+7)
            const now = new Date();
            
            // Chuyển sang giờ Việt Nam
            const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            
            // Hôm nay 16:00 VN
            const todayAt16 = new Date(vnNow);
            todayAt16.setHours(16, 0, 0, 0);
            
            // Hôm qua 16:00 VN
            const yesterdayAt16 = new Date(todayAt16);
            yesterdayAt16.setDate(yesterdayAt16.getDate() - 1);

            const fromTimestamp = Math.floor(yesterdayAt16.getTime() / 1000);
            const toTimestamp = Math.floor(todayAt16.getTime() / 1000);

            // Format dates cho API
            const yesterday = this.formatDate(yesterdayAt16);
            const today = this.formatDate(todayAt16);

            const yesterdayStr = yesterdayAt16.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
            const todayStr = todayAt16.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

            logger.info(`📅 Syncing retail bills from ${yesterdayStr} to ${todayStr}`);
            logger.info(`📅 Timestamp range: ${fromTimestamp} to ${toTimestamp}`);

            // 1. Lấy bills của 2 ngày (vì API không hỗ trợ filter theo giờ)
            const billsResponse = await nhanhService.getRetailBills({
                filters: {
                    fromDate: yesterday,
                    toDate: today
                },
                paginator: { size: 100 },
                dataOptions: {}
            });

            if (billsResponse.code !== 1 || !billsResponse.data) {
                const errorMsg = billsResponse.messages?.join(', ') || 'Failed to get retail bills';
                logger.error('❌ Failed to fetch retail bills', { error: errorMsg });
                return { success: false, error: errorMsg };
            }

            const allBills = billsResponse.data;

            // 2. Filter bills theo createdAt timestamp (từ 16:00 hôm qua đến 16:00 hôm nay)
            // NOTE: createdAt nằm trong object "created.createdAt", không phải root level
            const filteredBills = allBills.filter(bill => {
                const createdAt = bill.created?.createdAt || 0;
                if (!createdAt) return false; // Skip nếu không có timestamp
                return createdAt >= fromTimestamp && createdAt < toTimestamp;
            });

            logger.info(`📦 Total bills fetched: ${allBills.length}`);
            logger.info(`📦 Bills in time range (16:00-16:00): ${filteredBills.length}`);

            if (filteredBills.length === 0) {
                logger.info('ℹ️ No retail bills found in time range');
                return {
                    success: true,
                    summary: {
                        totalBills: 0,
                        successCount: 0,
                        failCount: 0,
                        timeRange: `${yesterday} 16:00 to ${today} 16:00`
                    },
                    results: []
                };
            }

            // 3. Lấy access token
            const accessToken = process.env.MISA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('MISA access token not found');
            }

            // 4. Xử lý từng hóa đơn
            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const bill of filteredBills) {
                try {
                    const billCreatedAt = bill.created?.createdAt || bill.createdAt || 0;
                    logger.info(`🔄 Processing bill ${bill.id} (type=${bill.type}, createdAt=${new Date(billCreatedAt * 1000).toISOString()})...`);

                    // Map sang format AMIS
                    const voucher = amisMapperService.mapRetailBillToAmisVoucher(bill);

                    // Gửi lên MISA
                    const amisResponse = await amisService.saveVoucher([voucher], accessToken);

                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        createdAt: new Date(billCreatedAt * 1000).toISOString(),
                        status: 'success',
                        voucherNo: voucher.org_refno,
                        amisResponse: amisResponse.Success ? 'Created' : 'Failed'
                    });

                    logger.info(`✅ Bill ${bill.id} synced successfully`);
                    successCount++;

                    // Delay nhỏ để tránh rate limit
                    await this.delay(500);

                } catch (error: any) {
                    const billCreatedAt = bill.created?.createdAt || bill.createdAt || 0;
                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        createdAt: billCreatedAt ? new Date(billCreatedAt * 1000).toISOString() : 'N/A',
                        status: 'failed',
                        error: error.message
                    });

                    logger.error(`❌ Bill ${bill.id} sync failed`, { error: error.message });
                    failCount++;
                }
            }

            // 5. Tổng kết
            const summary = {
                totalBills: filteredBills.length,
                successCount,
                failCount,
                timeRange: `${yesterday} 16:00 to ${today} 16:00`,
                fromTimestamp,
                toTimestamp,
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
     * Đồng bộ hóa đơn bán lẻ của ngày hôm nay (từ 00:00 đến hiện tại)
     */
    public async syncTodayBills(): Promise<{
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
            // Lấy ngày hôm nay
            const today = this.getTodayDate();

            logger.info(`📅 Syncing retail bills for date: ${today} (00:00 to now)`);

            // 1. Lấy danh sách hóa đơn từ Nhanh.vn
            const billsResponse = await nhanhService.getRetailBills({
                filters: {
                    fromDate: today,
                    toDate: today
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
                logger.info('ℹ️ No retail bills found for today');
                return {
                    success: true,
                    summary: { totalBills: 0, successCount: 0, failCount: 0, date: today },
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
                        voucherNo: voucher.org_refno,
                        amisResponse: amisResponse.Success ? 'Created' : 'Failed'
                    });

                    logger.info(`✅ Bill ${bill.id} synced successfully`);
                    successCount++;

                    // Delay nhỏ để tránh rate limit
                    await this.delay(500);

                } catch (error: any) {
                    results.push({
                        billId: bill.id,
                        customerName: bill.customer?.name || 'N/A',
                        amount: bill.payment?.amount || 0,
                        status: 'failed',
                        error: error.message
                    });

                    logger.error(`❌ Bill ${bill.id} sync failed`, { error: error.message });
                    failCount++;
                }
            }

            // 4. Tổng kết
            const summary = {
                totalBills: bills.length,
                successCount,
                failCount,
                date: today,
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
     * Format Date object thành yyyy-mm-dd
     */
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Lấy ngày hôm nay theo format yyyy-mm-dd
     */
    private getTodayDate(): string {
        return this.formatDate(new Date());
    }

    /**
     * Lấy ngày hôm qua theo format yyyy-mm-dd
     */
    private getYesterdayDate(): string {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return this.formatDate(yesterday);
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
