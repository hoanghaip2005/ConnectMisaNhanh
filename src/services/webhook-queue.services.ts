import db from '../database/mysql';
import logger from '../utils/logger';

export interface WebhookQueueItem {
    id?: number;
    event: string;
    order_id: number;
    business_id?: number;
    payload: any;
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
    retry_count?: number;
    error_message?: string;
    created_at?: Date;
    processed_at?: Date;
}

/**
 * Webhook Queue Service
 * Lưu webhook vào database và xử lý async
 */
class WebhookQueueService {

    /**
     * Lưu webhook vào queue và check duplicate
     * @returns { isNew, queueId } - isNew = true nếu webhook mới, false nếu duplicate
     */
    public async enqueue(data: {
        event: string;
        orderId: number;
        businessId?: number;
        payload: any;
    }): Promise<{ isNew: boolean; queueId?: number }> {
        try {
            // OPTIMIZATION: Loại bỏ transaction để tăng tốc độ response
            // Trade-off: Có thể bị race condition trong trường hợp cực hiếm (2 webhook cùng lúc)

            // 1. Check xem order đã được xử lý chưa (< 10ms với index)
            const result = await db.query<any[]>(
                'SELECT 1 FROM processed_orders WHERE order_id = ? LIMIT 1',
                [data.orderId]
            );

            // db.query trả về [rows, fields], lấy rows (phần tử đầu tiên)
            const existing = Array.isArray(result) ? result[0] : result;

            if (existing && Array.isArray(existing) && existing.length > 0) {
                logger.info(`Order ${data.orderId} already processed - skipping webhook`);
                return { isNew: false };
            }

            // 2. Insert vào webhook_queue (< 20ms)
            // ON DUPLICATE KEY tự động handle duplicate nếu có
            const insertResult = await db.query<any>(
                `INSERT INTO webhook_queue (event, order_id, business_id, payload, status)
                 VALUES (?, ?, ?, ?, 'pending')
                 ON DUPLICATE KEY UPDATE retry_count = retry_count + 1`,
                [data.event, data.orderId, data.businessId, JSON.stringify(data.payload)]
            );

            // db.query trả về [ResultSetHeader, FieldPacket[]], lấy ResultSetHeader
            const insertResultData = Array.isArray(insertResult) ? insertResult[0] : insertResult;
            const queueId = insertResultData?.insertId || 0;

            if (queueId > 0) {
                logger.info(`Webhook enqueued: order ${data.orderId}, queue ID ${queueId}`);
                return { isNew: true, queueId };
            } else {
                // Trường hợp ON DUPLICATE KEY (webhook duplicate)
                logger.info(`Webhook duplicate: order ${data.orderId}`);
                return { isNew: false };
            }

        } catch (error: any) {
            logger.error('Error enqueuing webhook:', error);
            // KHÔNG throw error để webhook vẫn trả về 200 cho Nhanh
            // Return isNew = false để skip processing
            return { isNew: false };
        }
    }

    /**
     * Đánh dấu order đã được xử lý thành công
     */
    public async markAsProcessed(orderId: number, queueId: number): Promise<void> {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // 1. Insert vào processed_orders
            await conn.execute(
                'INSERT IGNORE INTO processed_orders (order_id) VALUES (?)',
                [orderId]
            );

            // 2. Update webhook_queue status
            await conn.execute(
                `UPDATE webhook_queue 
                 SET status = 'completed', processed_at = NOW() 
                 WHERE id = ?`,
                [queueId]
            );

            await conn.commit();
            logger.info(`Order ${orderId} marked as processed`);

        } catch (error: any) {
            await conn.rollback();
            logger.error('Error marking as processed:', error);
            throw error;
        } finally {
            conn.release();
        }
    }

    /**
     * Đánh dấu xử lý thất bại
     */
    public async markAsFailed(queueId: number, errorMessage: string): Promise<void> {
        try {
            await db.query(
                `UPDATE webhook_queue 
                 SET status = 'failed', 
                     error_message = ?,
                     retry_count = retry_count + 1,
                     processed_at = NOW()
                 WHERE id = ?`,
                [errorMessage, queueId]
            );

            logger.warn(`Queue item ${queueId} marked as failed: ${errorMessage}`);
        } catch (error: any) {
            logger.error('Error marking as failed:', error);
        }
    }

    /**
     * Danh dau webhook da duoc bo qua theo dung business rule.
     */
    public async markAsSkipped(queueId: number, reason: string): Promise<void> {
        try {
            await db.query(
                `UPDATE webhook_queue
                 SET status = 'skipped',
                     error_message = ?,
                     processed_at = NOW()
                 WHERE id = ?`,
                [reason, queueId]
            );

            logger.info(`Queue item ${queueId} marked as skipped: ${reason}`);
        } catch (error: any) {
            logger.error('Error marking as skipped:', error);
        }
    }

    /**
     * Lấy pending webhooks để xử lý (cho cronjob)
     */
    public async getPendingWebhooks(limit: number = 10): Promise<WebhookQueueItem[]> {
        try {
            const rows = await db.query<any[]>(
                `SELECT * FROM webhook_queue 
                 WHERE status = 'pending' AND retry_count < 3
                 ORDER BY created_at ASC
                 LIMIT ?`,
                [limit]
            );

            return rows.map(row => ({
                ...row,
                payload: JSON.parse(row.payload)
            }));
        } catch (error: any) {
            logger.error('Error getting pending webhooks:', error);
            return [];
        }
    }

    /**
     * Check xem order đã được xử lý chưa (nhanh)
     */
    public async isOrderProcessed(orderId: number): Promise<boolean> {
        try {
            const rows = await db.query<any[]>(
                'SELECT id FROM processed_orders WHERE order_id = ?',
                [orderId]
            );
            return rows.length > 0;
        } catch (error: any) {
            logger.error('Error checking processed order:', error);
            return false;
        }
    }
}

export default new WebhookQueueService();
