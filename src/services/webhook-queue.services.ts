import db from '../database/mysql';
import logger from '../utils/logger';

export interface WebhookQueueItem {
    id?: number;
    event: string;
    order_id: number;
    business_id?: number;
    payload: any;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
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
        const conn = await db.getConnection();
        
        try {
            await conn.beginTransaction();

            // 1. Check xem order đã được xử lý chưa
            const [existing] = await conn.execute<any[]>(
                'SELECT id FROM processed_orders WHERE order_id = ?',
                [data.orderId]
            );

            if (existing.length > 0) {
                await conn.commit();
                logger.info(`Order ${data.orderId} already processed - skipping webhook`);
                return { isNew: false };
            }

            // 2. Insert vào webhook_queue
            const [result] = await conn.execute<any>(
                `INSERT INTO webhook_queue (event, order_id, business_id, payload, status)
                 VALUES (?, ?, ?, ?, 'pending')
                 ON DUPLICATE KEY UPDATE retry_count = retry_count + 1`,
                [data.event, data.orderId, data.businessId, JSON.stringify(data.payload)]
            );

            await conn.commit();

            const queueId = result.insertId;
            logger.info(`Webhook enqueued: order ${data.orderId}, queue ID ${queueId}`);

            return { isNew: true, queueId };

        } catch (error: any) {
            await conn.rollback();
            logger.error('Error enqueuing webhook:', error);
            throw error;
        } finally {
            conn.release();
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
