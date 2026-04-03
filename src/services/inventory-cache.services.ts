import { AmisService } from './amis.services';
import amisTokenManager from './amis-token-manager.services';
import logger from '../utils/logger';

/**
 * Service để cache danh sách vật tư từ MISA AMIS
 * Giúp kiểm tra nhanh mã vật tư có tồn tại không
 */
class InventoryCacheService {
    private inventoryMap: Map<string, any> = new Map();
    private lastSyncTime: number = 0;
    private cacheExpiry: number = 3600000; // 1 giờ
    private isLoading: boolean = false;
    private amisService: AmisService;

    constructor() {
        this.amisService = new AmisService();
    }

    private normalizeCode(code: string | null | undefined): string {
        return String(code || '').trim();
    }

    /**
     * Load toàn bộ danh sách vật tư từ MISA AMIS
     */
    private async loadInventoryItems(): Promise<void> {
        if (this.isLoading) {
            logger.info('Inventory cache is already loading, skipping...');
            return;
        }

        this.isLoading = true;
        logger.info('Starting to load inventory items from MISA AMIS');

        try {
            const accessToken = await amisTokenManager.getValidToken();
            if (!accessToken) {
                throw new Error('Failed to get access token');
            }

            this.inventoryMap.clear();
            let skip = 0;
            const take = 1000;
            let hasMore = true;

            while (hasMore) {
                const result = await this.amisService.getInventoryItems(
                    accessToken,
                    skip,
                    take
                );

                if (Array.isArray(result.Data) && result.Data.length > 0) {
                    const items = result.Data;
                    // Thêm vào map với key là inventory_item_code
                    for (const item of items) {
                        const normalizedCode = this.normalizeCode(item.inventory_item_code);
                        if (normalizedCode) {
                            this.inventoryMap.set(normalizedCode, {
                                id: item.inventory_item_id,
                                code: normalizedCode,
                                name: item.inventory_item_name,
                                unit_id: item.unit_id,
                                unit_name: item.unit_name,
                                tax_rate: item.tax_rate,
                                stock_id: item.default_stock_id
                            });
                        }
                    }

                    logger.info(`Loaded ${items.length} inventory items (skip: ${skip})`);

                    // Nếu số lượng trả về ít hơn take thì đã hết
                    if (items.length < take) {
                        hasMore = false;
                    } else {
                        skip += take;
                    }
                } else {
                    hasMore = false;
                }
            }

            this.lastSyncTime = Date.now();
            logger.info(`Inventory cache loaded successfully: ${this.inventoryMap.size} items`);
        } catch (error: any) {
            logger.error('Failed to load inventory items', { error: error.message });
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Kiểm tra và làm mới cache nếu cần
     */
    private async refreshCacheIfNeeded(): Promise<void> {
        const now = Date.now();
        const cacheAge = now - this.lastSyncTime;

        // Nếu cache chưa load hoặc đã quá hạn
        if (this.inventoryMap.size === 0 || cacheAge > this.cacheExpiry) {
            logger.info(`Cache expired or empty (age: ${cacheAge}ms), reloading...`);
            await this.loadInventoryItems();
        }
    }

    /**
     * Kiểm tra mã vật tư có tồn tại trong MISA không
     * @param code - Mã vật tư cần kiểm tra
     * @returns Thông tin vật tư nếu tồn tại, null nếu không
     */
    public async checkInventoryCode(code: string): Promise<any | null> {
        await this.refreshCacheIfNeeded();
        return this.inventoryMap.get(this.normalizeCode(code)) || null;
    }

    /**
     * Kiểm tra nhiều mã vật tư cùng lúc
     * @param codes - Danh sách mã vật tư cần kiểm tra
     * @returns Map với key là mã vật tư, value là thông tin (hoặc null nếu không tồn tại)
     */
    public async checkMultipleInventoryCodes(codes: string[]): Promise<Map<string, any | null>> {
        await this.refreshCacheIfNeeded();
        
        const result = new Map<string, any | null>();
        for (const code of codes) {
            result.set(code, this.inventoryMap.get(this.normalizeCode(code)) || null);
        }
        
        return result;
    }

    /**
     * Force reload cache
     */
    public async forceReload(): Promise<void> {
        logger.info('Force reloading inventory cache');
        this.lastSyncTime = 0;
        await this.loadInventoryItems();
    }

    /**
     * Lấy thống kê cache
     */
    public getCacheStats(): { size: number; lastSync: number; age: number } {
        return {
            size: this.inventoryMap.size,
            lastSync: this.lastSyncTime,
            age: Date.now() - this.lastSyncTime
        };
    }
}

export default new InventoryCacheService();
