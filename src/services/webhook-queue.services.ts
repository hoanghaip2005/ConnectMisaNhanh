import Database from 'better-sqlite3';
import path from 'path';
import logger from '../utils/logger';

/**
 * Webhook Queue Service using SQLite
 * Lưu webhook vào database và xử lý sau
 */
class WebhookQueueService {
    private db: Database.Database;

    constructor() {
        // Tạo database file trong thư mục data
        const dbPath = path.resolve(process.cwd(), 'data', 'webhooks.db');
        this.db = new Database(dbPath);
        
        // Khởi tạo table
        this.initDatabase();
        
        logger.info('Webhook Queue Service initialized with SQLite');
    }

    /**
     * Khởi tạo database schema
     */
    private initDatabase(): void {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS webhook_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                order_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                retry_count INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at INTEGER NOT NULL,
                processed_at INTEGER
            )
        `;
        
        this.db.exec(createTableSQL);
        
        // Tạo indexes riêng
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_order_id ON webhook_queue(order_id)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_status ON webhook_queue(status)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_created_at ON webhook_queue(created_at)');
        
        logger.info('Webhook queue table initialized');
    }

    /**
     * Thêm webhook vào queue
     */
    public enqueue(event: string, orderId: number, payload: any): boolean {
        try {
            const insertSQL = `
                INSERT INTO webhook_queue (event, order_id, payload, status, created_at)
                VALUES (?, ?, ?, 'pending', ?)
            `;
            
            const stmt = this.db.prepare(insertSQL);
            const result = stmt.run(
                event,
                orderId,
                JSON.stringify(payload),
                Date.now()
            );
            
            logger.info(`Webhook enqueued: ID=${result.lastInsertRowid}, Order=${orderId}, Event=${event}`);
            return true;
        } catch (error: any) {
            logger.error('Error enqueuing webhook:', error);
            return false;
        }
    }

    /**
     * Kiểm tra xem order đã có trong queue chưa
     * Tránh xử lý trùng lặp
     */
    public hasOrderInQueue(orderId: number): boolean {
        try {
            const checkSQL = `
                SELECT COUNT(*) as count 
                FROM webhook_queue 
                WHERE order_id = ? 
                AND status IN ('pending', 'processing', 'completed')
            `;
            
            const stmt = this.db.prepare(checkSQL);
            const result = stmt.get(orderId) as { count: number };
            
            return result.count > 0;
        } catch (error: any) {
            logger.error('Error checking order in queue:', error);
            return false;
        }
    }

    /**
     * Lấy webhook pending đầu tiên để xử lý
     */
    public dequeue(): any | null {
        try {
            const selectSQL = `
                SELECT * FROM webhook_queue 
                WHERE status = 'pending' 
                ORDER BY created_at ASC 
                LIMIT 1
            `;
            
            const webhook = this.db.prepare(selectSQL).get();
            
            if (webhook) {
                // Đánh dấu là đang xử lý
                const updateSQL = `
                    UPDATE webhook_queue 
                    SET status = 'processing' 
                    WHERE id = ?
                `;
                this.db.prepare(updateSQL).run((webhook as any).id);
            }
            
            return webhook;
        } catch (error: any) {
            logger.error('Error dequeuing webhook:', error);
            return null;
        }
    }

    /**
     * Đánh dấu webhook đã xử lý thành công
     */
    public markCompleted(id: number): void {
        try {
            const updateSQL = `
                UPDATE webhook_queue 
                SET status = 'completed', processed_at = ? 
                WHERE id = ?
            `;
            
            this.db.prepare(updateSQL).run(Date.now(), id);
            logger.info(`Webhook ${id} marked as completed`);
        } catch (error: any) {
            logger.error('Error marking webhook as completed:', error);
        }
    }

    /**
     * Đánh dấu webhook bị lỗi
     */
    public markFailed(id: number, errorMessage: string): void {
        try {
            const updateSQL = `
                UPDATE webhook_queue 
                SET status = 'failed', 
                    retry_count = retry_count + 1,
                    error_message = ?,
                    processed_at = ?
                WHERE id = ?
            `;
            
            this.db.prepare(updateSQL).run(errorMessage, Date.now(), id);
            logger.error(`Webhook ${id} marked as failed: ${errorMessage}`);
        } catch (error: any) {
            logger.error('Error marking webhook as failed:', error);
        }
    }

    /**
     * Retry webhook bị lỗi (reset về pending)
     */
    public retryFailed(id: number): void {
        try {
            const updateSQL = `
                UPDATE webhook_queue 
                SET status = 'pending', processed_at = NULL 
                WHERE id = ? AND retry_count < 3
            `;
            
            this.db.prepare(updateSQL).run(id);
            logger.info(`Webhook ${id} queued for retry`);
        } catch (error: any) {
            logger.error('Error retrying webhook:', error);
        }
    }

    /**
     * Lấy thống kê queue
     */
    public getStats(): any {
        try {
            const statsSQL = `
                SELECT 
                    status,
                    COUNT(*) as count
                FROM webhook_queue
                GROUP BY status
            `;
            
            const stats = this.db.prepare(statsSQL).all();
            return stats;
        } catch (error: any) {
            logger.error('Error getting queue stats:', error);
            return [];
        }
    }

    /**
     * Xóa các webhook đã hoàn thành (> 7 ngày)
     */
    public cleanupOldWebhooks(): number {
        try {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const deleteSQL = `
                DELETE FROM webhook_queue 
                WHERE status = 'completed' 
                AND processed_at < ?
            `;
            
            const result = this.db.prepare(deleteSQL).run(sevenDaysAgo);
            logger.info(`Cleaned up ${result.changes} old webhooks`);
            return result.changes;
        } catch (error: any) {
            logger.error('Error cleaning up old webhooks:', error);
            return 0;
        }
    }

    /**
     * Đóng database connection
     */
    public close(): void {
        this.db.close();
        logger.info('Webhook Queue Service closed');
    }
}

export default new WebhookQueueService();
