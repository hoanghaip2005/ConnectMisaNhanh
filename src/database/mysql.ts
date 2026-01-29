import mysql from 'mysql2/promise';
import logger from '../utils/logger';

/**
 * MySQL Connection Pool
 */
class Database {
    private pool: mysql.Pool | null = null;

    constructor() {
        this.initPool();
    }

    private initPool(): void {
        try {
            this.pool = mysql.createPool({
                host: process.env.MYSQL_HOST || 'localhost',
                port: parseInt(process.env.MYSQL_PORT || '3306'),
                user: process.env.MYSQL_USER || 'root',
                password: process.env.MYSQL_PASSWORD || '',
                database: process.env.MYSQL_DATABASE || 'middleware_integration',
                waitForConnections: true,
                connectionLimit: 20,  // Tăng từ 10 lên 20 để xử lý nhiều webhooks đồng thời
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0,
                connectTimeout: 2000  // Timeout kết nối sau 2s
            });

            logger.info('MySQL connection pool created');
        } catch (error: any) {
            logger.error('Error creating MySQL pool:', error);
            throw error;
        }
    }

    public async query<T = any>(sql: string, params?: any[]): Promise<T> {
        if (!this.pool) {
            throw new Error('MySQL pool not initialized');
        }

        try {
            const [rows] = await this.pool.execute(sql, params);
            return rows as T;
        } catch (error: any) {
            logger.error('MySQL query error:', { sql, params, error: error.message });
            throw error;
        }
    }

    public async getConnection(): Promise<mysql.PoolConnection> {
        if (!this.pool) {
            throw new Error('MySQL pool not initialized');
        }
        return await this.pool.getConnection();
    }

    public async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            logger.info('MySQL connection pool closed');
        }
    }
}

export default new Database();
