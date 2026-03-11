import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AmisService } from './amis.services';
import logger from '../utils/logger';

dotenv.config();

/**
 * Service quản lý AMIS Access Token
 * Tự động refresh token và lưu vào .env
 */
export class AmisTokenManager {
    private amisService: AmisService;
    private envPath: string;
    private refreshInterval: NodeJS.Timeout | null = null;
    private tokenExpiredAt: Date | null = null; // Lưu thời điểm token hết hạn

    constructor() {
        this.amisService = new AmisService();
        this.envPath = path.resolve(process.cwd(), '.env');
    }

    /**
     * Lấy token mới và lưu vào .env
     */
    public async refreshToken(): Promise<string> {
        try {
            logger.info('Refreshing AMIS access token...');

            // Lấy token mới
            const tokenData = await this.amisService.connect();

            // Lưu thời điểm hết hạn (trừ 10 phút để refresh sớm)
            if (tokenData.expired_time) {
                this.tokenExpiredAt = new Date(new Date(tokenData.expired_time).getTime() - 10 * 60 * 1000);
            }

            // Lưu vào .env
            this.updateEnvFile('MISA_ACCESS_TOKEN', tokenData.access_token);

            // Cập nhật process.env
            process.env.MISA_ACCESS_TOKEN = tokenData.access_token;

            logger.info('AMIS access token refreshed successfully', {
                expired_time: tokenData.expired_time,
                tenant_code: tokenData.tenant_code
            });

            return tokenData.access_token;
        } catch (error: any) {
            logger.error('Failed to refresh AMIS token', error);
            throw error;
        }
    }

    /**
     * Cập nhật giá trị trong file .env
     */
    private updateEnvFile(key: string, value: string): void {
        try {
            // Đọc file .env
            let envContent = fs.readFileSync(this.envPath, 'utf8');

            // Tìm và thay thế hoặc thêm mới
            const regex = new RegExp(`^${key}=.*$`, 'm');

            if (regex.test(envContent)) {
                // Cập nhật giá trị hiện có
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                // Thêm mới nếu chưa có
                envContent += `\n${key}=${value}`;
            }

            // Ghi lại file .env
            fs.writeFileSync(this.envPath, envContent, 'utf8');

            logger.debug(`Updated ${key} in .env file`);
        } catch (error: any) {
            logger.error('Failed to update .env file', error);
            throw error;
        }
    }

    /**
     * Bắt đầu auto-refresh token mỗi 12 giờ
     */
    public startAutoRefresh(): void {
        logger.info('Starting AMIS token auto-refresh...');

        // Refresh ngay lập tức
        this.refreshToken().catch(err => {
            logger.error('Initial token refresh failed', err);
        });

        // Refresh mỗi 12 giờ (token expire sau 12h)
        // Set interval = 11 giờ để đảm bảo refresh trước khi hết hạn
        const REFRESH_INTERVAL = 11 * 60 * 60 * 1000; // 11 hours

        this.refreshInterval = setInterval(() => {
            this.refreshToken().catch(err => {
                logger.error('Scheduled token refresh failed', err);
            });
        }, REFRESH_INTERVAL);

        logger.info('Auto-refresh enabled (every 11 hours)');
    }

    /**
     * Dừng auto-refresh
     */
    public stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            logger.info('Auto-refresh stopped');
        }
    }

    /**
     * Kiểm tra token còn hiệu lực không
     */
    public isTokenValid(): boolean {
        const token = process.env.MISA_ACCESS_TOKEN;
        if (!token) {
            return false;
        }
        // TODO: Implement token validation logic if needed
        return true;
    }

    /**
     * Lấy token hiện tại, refresh nếu hết hạn hoặc sắp hết hạn
     */
    public async getValidToken(): Promise<string> {
        let token = process.env.MISA_ACCESS_TOKEN;

        // Refresh nếu: không có token, token rỗng, hoặc đã quá thời điểm hết hạn
        const isExpired = this.tokenExpiredAt && new Date() >= this.tokenExpiredAt;

        if (!token || token.trim() === '' || isExpired) {
            if (isExpired) {
                logger.warn('MISA token expired or about to expire, refreshing...');
            } else {
                logger.warn('No token found, fetching new one');
            }
            token = await this.refreshToken();
        }

        return token;
    }
}

export default new AmisTokenManager();
