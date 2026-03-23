import fs from 'fs/promises';
import path from 'path';
import db from '../database/mysql';

type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface QueueSummaryRow {
    total_queue: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    last_webhook_at: Date | null;
}

interface ProcessedCountRow {
    total_processed_orders: number;
}

interface QueueRow {
    id: number;
    event: string;
    order_id: number;
    business_id: number | null;
    status: QueueStatus;
    retry_count: number;
    error_message: string | null;
    created_at: Date;
    processed_at: Date | null;
}

interface ProcessedOrderRow {
    id: number;
    order_id: number;
    created_at: Date;
}

interface LogStreamResponse {
    configured: boolean;
    path: string | null;
    filename: string | null;
    lines: string[];
    updatedAt: string;
    message?: string;
}

class OpsDashboardService {
    public async getOverview(limit: number = 25) {
        const queueSummaryRows = await db.query<QueueSummaryRow[]>(
            `SELECT
                COUNT(*) AS total_queue,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
                MAX(created_at) AS last_webhook_at
             FROM webhook_queue`
        );

        const processedCountRows = await db.query<ProcessedCountRow[]>(
            'SELECT COUNT(*) AS total_processed_orders FROM processed_orders'
        );

        const recentQueue = await db.query<QueueRow[]>(
            `SELECT
                id,
                event,
                order_id,
                business_id,
                status,
                retry_count,
                error_message,
                created_at,
                processed_at
             FROM webhook_queue
             ORDER BY created_at DESC
             LIMIT ?`,
            [limit]
        );

        const recentProcessedOrders = await db.query<ProcessedOrderRow[]>(
            `SELECT id, order_id, created_at
             FROM processed_orders
             ORDER BY created_at DESC
             LIMIT ?`,
            [limit]
        );

        const recentFailures = await db.query<QueueRow[]>(
            `SELECT
                id,
                event,
                order_id,
                business_id,
                status,
                retry_count,
                error_message,
                created_at,
                processed_at
             FROM webhook_queue
             WHERE status = 'failed'
             ORDER BY processed_at DESC, created_at DESC
             LIMIT 10`
        );

        const queueSummary = queueSummaryRows[0] || {
            total_queue: 0,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            last_webhook_at: null
        };

        const processedSummary = processedCountRows[0] || {
            total_processed_orders: 0
        };

        return {
            generatedAt: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            serverUrl: process.env.SERVER_URL || null,
            database: {
                connected: true,
                summary: {
                    totalQueue: queueSummary.total_queue,
                    pending: queueSummary.pending,
                    processing: queueSummary.processing,
                    completed: queueSummary.completed,
                    failed: queueSummary.failed,
                    totalProcessedOrders: processedSummary.total_processed_orders,
                    lastWebhookAt: queueSummary.last_webhook_at
                }
            },
            logs: {
                out: this.getLogMetadata('out'),
                error: this.getLogMetadata('error')
            },
            recentQueue,
            recentProcessedOrders,
            recentFailures
        };
    }

    public async getOrderDetails(orderId: number) {
        const queueItems = await db.query<QueueRow[]>(
            `SELECT
                id,
                event,
                order_id,
                business_id,
                status,
                retry_count,
                error_message,
                created_at,
                processed_at
             FROM webhook_queue
             WHERE order_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [orderId]
        );

        const processedRecords = await db.query<ProcessedOrderRow[]>(
            `SELECT id, order_id, created_at
             FROM processed_orders
             WHERE order_id = ?
             ORDER BY created_at DESC`,
            [orderId]
        );

        return {
            orderId,
            found: queueItems.length > 0 || processedRecords.length > 0,
            queueItems,
            processedRecords
        };
    }

    public async getPm2Logs(stream: 'out' | 'error', requestedLines: number = 120): Promise<LogStreamResponse> {
        const logPath = stream === 'out'
            ? process.env.PM2_OUT_LOG_PATH || null
            : process.env.PM2_ERROR_LOG_PATH || null;

        if (!logPath) {
            return {
                configured: false,
                path: null,
                filename: null,
                lines: [],
                updatedAt: new Date().toISOString(),
                message: `Missing ${stream === 'out' ? 'PM2_OUT_LOG_PATH' : 'PM2_ERROR_LOG_PATH'}`
            };
        }

        try {
            const lines = await this.readLastLines(logPath, requestedLines);

            return {
                configured: true,
                path: logPath,
                filename: path.basename(logPath),
                lines,
                updatedAt: new Date().toISOString()
            };
        } catch (error: any) {
            return {
                configured: true,
                path: logPath,
                filename: path.basename(logPath),
                lines: [],
                updatedAt: new Date().toISOString(),
                message: error.message || 'Unable to read log file'
            };
        }
    }

    private getLogMetadata(stream: 'out' | 'error') {
        const logPath = stream === 'out'
            ? process.env.PM2_OUT_LOG_PATH || null
            : process.env.PM2_ERROR_LOG_PATH || null;

        return {
            configured: !!logPath,
            path: logPath,
            filename: logPath ? path.basename(logPath) : null
        };
    }

    private async readLastLines(filePath: string, maxLines: number): Promise<string[]> {
        const handle = await fs.open(filePath, 'r');

        try {
            const stats = await handle.stat();

            if (stats.size === 0) {
                return [];
            }

            const bytesToRead = Math.min(stats.size, 256 * 1024);
            const start = Math.max(stats.size - bytesToRead, 0);
            const buffer = Buffer.alloc(bytesToRead);

            await handle.read(buffer, 0, bytesToRead, start);

            let content = buffer.toString('utf8');

            if (start > 0) {
                const firstNewLineIndex = content.indexOf('\n');
                content = firstNewLineIndex >= 0 ? content.slice(firstNewLineIndex + 1) : content;
            }

            return content
                .split(/\r?\n/)
                .filter((line) => line.trim().length > 0)
                .slice(-Math.max(10, Math.min(maxLines, 500)));
        } finally {
            await handle.close();
        }
    }
}

export default new OpsDashboardService();
