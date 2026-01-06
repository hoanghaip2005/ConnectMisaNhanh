import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AmisService } from './amis.services';

dotenv.config();

/**
 * Service quản lý AMIS Access Token
 * Tự động refresh token và lưu vào .env
 */
export class AmisTokenManager {
    private amisService: AmisService;
    private envPath: string;
    private refreshInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.amisService = new AmisService();
        this.envPath = path.resolve(process.cwd(), '.env');
    }

    /**
     * Lấy token mới và lưu vào .env
     */
    public async refreshToken(): Promise<string> {
        try {
            console.log('🔄 Refreshing AMIS access token...');

            // Lấy token mới
            const tokenData = await this.amisService.connect();

            // Lưu vào .env
            this.updateEnvFile('MISA_ACCESS_TOKEN', tokenData.access_token);

            // Cập nhật process.env
            process.env.MISA_ACCESS_TOKEN = tokenData.access_token;

            console.log('✅ AMIS access token refreshed successfully');
            console.log(`   - Token expires: ${tokenData.expired_time}`);
            console.log(`   - Tenant: ${tokenData.tenant_code}`);

            return tokenData.access_token;
        } catch (error: any) {
            console.error('❌ Failed to refresh AMIS token:', error.message);
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

            console.log(`   - Updated ${key} in .env file`);
        } catch (error: any) {
            console.error(`Failed to update .env file:`, error.message);
            throw error;
        }
    }

    /**
     * Bắt đầu auto-refresh token mỗi 12 giờ
     */
    public startAutoRefresh(): void {
        console.log('🚀 Starting AMIS token auto-refresh...');

        // Refresh ngay lập tức
        this.refreshToken().catch(err => {
            console.error('Initial token refresh failed:', err.message);
        });

        // Refresh mỗi 12 giờ (token expire sau 12h)
        // Set interval = 11 giờ để đảm bảo refresh trước khi hết hạn
        const REFRESH_INTERVAL = 11 * 60 * 60 * 1000; // 11 hours

        this.refreshInterval = setInterval(() => {
            this.refreshToken().catch(err => {
                console.error('Scheduled token refresh failed:', err.message);
            });
        }, REFRESH_INTERVAL);

        console.log('✅ Auto-refresh enabled (every 11 hours)');
    }

    /**
     * Dừng auto-refresh
     */
    public stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('⏸️  Auto-refresh stopped');
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
     * Lấy token hiện tại, refresh nếu hết hạn
     */
    public async getValidToken(): Promise<string> {
        let token = process.env.MISA_ACCESS_TOKEN;

        if (!token || token.trim() === '') {
            console.log('⚠️  No token found, fetching new one...');
            token = await this.refreshToken();
        }

        return token;
    }
}

export default new AmisTokenManager();
