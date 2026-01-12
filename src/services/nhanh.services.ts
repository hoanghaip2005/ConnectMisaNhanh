import axios from 'axios';
import dotenv from 'dotenv';
import {
    NhanhOAuthConfig,
    AccessTokenRequest,
    AccessTokenResponse,
    CheckTokenRequest,
    CheckTokenResponse,
    OAuthUrlParams,
    OrderListRequest,
    OrderListResponse
} from '../types/nhanh.types';// Load environment variables
dotenv.config();

/**
 * Service class for Nhanh.vn OAuth and API integration
 */
export class NhanhService {
    private config: NhanhOAuthConfig;
    private axiosInstance: any;

    constructor() {
        this.config = {
            appId: process.env.NHANH_APP_ID || '',
            secretKey: process.env.NHANH_SECRET_KEY || '',
            apiVersion: process.env.NHANH_API_VERSION || '3.0',
            baseUrl: process.env.NHANH_BASE_URL || 'https://pos.open.nhanh.vn',
            oauthUrl: process.env.NHANH_OAUTH_URL || 'https://nhanh.vn/oauth'
        };

        this.axiosInstance = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    /**
     * Generate OAuth authorization URL
     * Step 1: Redirect user to Nhanh.vn OAuth page
     * @param returnLink - The callback URL (must be HTTPS and in Redirect URL list)
     * @returns OAuth URL for user authorization
     */
    public getOAuthUrl(returnLink: string): string {
        if (!returnLink.startsWith('https://')) {
            throw new Error('Return link must use HTTPS protocol');
        }

        const params: OAuthUrlParams = {
            version: this.config.apiVersion,
            appId: this.config.appId,
            returnLink: encodeURIComponent(returnLink)
        };

        return `${this.config.oauthUrl}?version=${params.version}&appId=${params.appId}&returnLink=${params.returnLink}`;
    }

    /**
     * Exchange access code for access token
     * Step 3: Call API to get access token using access code
     * @param accessCode - The code received from OAuth callback (valid for 10 minutes)
     * @returns Access token response with token details
     */
    public async getAccessToken(accessCode: string): Promise<AccessTokenResponse> {
        try {
            const url = `${this.config.baseUrl}/v${this.config.apiVersion}/app/getaccesstoken`;

            const payload: AccessTokenRequest = {
                accessCode,
                secretKey: this.config.secretKey
            };

            const response = await this.axiosInstance.post(
                url,
                payload,
                {
                    params: {
                        appId: this.config.appId
                    }
                }
            );

            if (response.data.code === 0) {
                throw new Error(response.data.messages?.join(', ') || 'Failed to get access token');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Nhanh API Error: ${error.response?.data?.messages?.join(', ') || error.message}`);
            }
            throw error;
        }
    }

    /**
     * Check access token validity and permissions
     * @param accessToken - The access token to check
     * @param businessId - The business ID from Nhanh.vn
     * @returns Token information including expiry and permissions
     */
    public async checkAccessToken(
        accessToken: string,
        businessId: number
    ): Promise<CheckTokenResponse> {
        try {
            const url = `${this.config.baseUrl}/v${this.config.apiVersion}/app/checkaccesstoken`;

            const payload: CheckTokenRequest = {
                secretKey: this.config.secretKey
            };

            const response = await this.axiosInstance.post(
                url,
                payload,
                {
                    params: {
                        appId: this.config.appId,
                        businessId
                    },
                    headers: {
                        'Authorization': accessToken
                    }
                }
            );

            if (response.data.code === 0) {
                throw new Error(response.data.messages?.join(', ') || 'Invalid access token');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Nhanh API Error: ${error.response?.data?.messages?.join(', ') || error.message}`);
            }
            throw error;
        }
    }

    /**
     * Validate configuration
     * @returns true if configuration is valid
     */
    public validateConfig(): boolean {
        if (!this.config.appId || !this.config.secretKey) {
            throw new Error('Missing required configuration: appId or secretKey');
        }
        return true;
    }

    /**
     * Get configuration (without sensitive data)
     * @returns Safe configuration object
     */
    public getConfig(): Partial<NhanhOAuthConfig> {
        return {
            appId: this.config.appId,
            apiVersion: this.config.apiVersion,
            baseUrl: this.config.baseUrl,
            oauthUrl: this.config.oauthUrl
        };
    }

    /**
     * Get order list from Nhanh.vn
     * @param request - Order list request with filters and pagination
     * @returns Order list response
     */
    public async getOrderList(request: OrderListRequest): Promise<OrderListResponse> {
        try {
            const accessToken = process.env.NHANH_ACCESS_TOKEN;
            const businessId = process.env.NHANH_BUSINESS_ID;
            const appId = this.config.appId;

            if (!accessToken || !businessId) {
                throw new Error('Missing access token or business ID');
            }

            const url = `${this.config.baseUrl}/v${this.config.apiVersion}/order/list`;

            const response = await this.axiosInstance.post(
                url,
                request,
                {
                    params: {
                        appId,
                        businessId
                    },
                    headers: {
                        'Authorization': accessToken
                    }
                }
            );

            if (response.data.code === 0) {
                throw new Error(response.data.messages?.join(', ') || 'Failed to get order list');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Nhanh API Error: ${error.response?.data?.messages?.join(', ') || error.message}`);
            }
            throw error;
        }
    }

    /**
     * Lấy chi tiết một đơn hàng theo ID
     */
    public async getOrder(orderId: number): Promise<any> {
        try {
            const response = await this.getOrderList({
                filters: {
                    ids: [orderId]
                }
            });

            if (response.data && response.data.length > 0) {
                return { data: response.data[0] };
            }

            return null;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Lấy lịch sử thao tác đơn hàng
     * POST /v3.0/order/history
     * @param orderIds - Mảng ID đơn hàng (tối đa 100)
     * @param type - Loại lịch sử (logcarrier: Load lịch sử từ hãng vận chuyển)
     */
    public async getOrderHistory(orderIds: number[], type?: string): Promise<any> {
        try {
            const accessToken = process.env.NHANH_ACCESS_TOKEN;
            const businessId = process.env.NHANH_BUSINESS_ID;
            const appId = this.config.appId;

            if (!accessToken || !businessId) {
                throw new Error('Missing access token or business ID');
            }

            if (!orderIds || orderIds.length === 0) {
                throw new Error('orderIds is required');
            }

            if (orderIds.length > 100) {
                throw new Error('Maximum 100 orderIds allowed');
            }

            const url = `${this.config.baseUrl}/v${this.config.apiVersion}/order/history`;

            const payload: any = {
                filters: {
                    orderIds
                }
            };

            if (type) {
                payload.filters.type = type;
            }

            const response = await this.axiosInstance.post(
                url,
                payload,
                {
                    params: {
                        appId,
                        businessId
                    },
                    headers: {
                        'Authorization': accessToken
                    }
                }
            );

            if (response.data.code === 0) {
                throw new Error(response.data.messages?.join(', ') || 'Failed to get order history');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Nhanh API Error: ${error.response?.data?.messages?.join(', ') || error.message}`);
            }
            throw error;
        }
    }

    /**
     * Lấy danh sách hóa đơn bán lẻ
     */
    public async getRetailBills(request: any): Promise<any> {
        try {
            const accessToken = process.env.NHANH_ACCESS_TOKEN;
            const businessId = process.env.NHANH_BUSINESS_ID;
            const appId = this.config.appId;

            if (!accessToken || !businessId) {
                throw new Error('Missing access token or business ID');
            }

            const url = `${this.config.baseUrl}/v${this.config.apiVersion}/bill/retail`;

            const response = await this.axiosInstance.post(
                url,
                request,
                {
                    params: {
                        appId,
                        businessId
                    },
                    headers: {
                        'Authorization': accessToken
                    }
                }
            );

            if (response.data.code === 0) {
                throw new Error(response.data.messages?.join(', ') || 'Failed to get retail bills');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Nhanh API Error: ${error.response?.data?.messages?.join(', ') || error.message}`);
            }
            throw error;
        }
    }
}

export default new NhanhService();
