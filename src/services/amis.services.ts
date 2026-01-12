import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import logger from '../utils/logger';
import {
    AmisConnectRequest,
    AmisConnectResponse,
    AmisTokenData,
    CallbackDataInput,
    CallbackDataDetail,
    CallBackDataType,
    SaveVoucherRequest,
    SaveVoucherResponse,
    SaVoucher,
    CheckCallbackRequest,
    CheckCallbackResponse
} from '../types/amis.types';

dotenv.config();

/**
 * Service class for MISA AMIS API integration
 */
export class AmisService {
    private apiUrl: string;
    private appId: string;
    private accessCode: string;
    private orgCompanyCode: string;
    private axiosInstance: any;

    constructor() {
        this.apiUrl = process.env.MISA_API_BASE_URL || 'https://actapp.misa.vn';
        this.appId = process.env.MISA_APP_ID || '';
        this.accessCode = process.env.MISA_ACCESS_CODE || '';
        this.orgCompanyCode = process.env.MISA_ORG_COMPANY_CODE || '';

        this.axiosInstance = axios.create({
            baseURL: this.apiUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    /**
     * Hàm kết nối với AMIS kế toán để lấy token
     * POST /api/oauth/actopen/connect
     */
    public async connect(): Promise<AmisTokenData> {
        try {
            const url = `${this.apiUrl}/api/oauth/actopen/connect`;

            const payload: AmisConnectRequest = {
                app_id: this.appId,
                access_code: this.accessCode,
                org_company_code: this.orgCompanyCode
            };

            const response = await this.axiosInstance.post(
                '/api/oauth/actopen/connect',
                payload
            );

            if (!response.data.Success) {
                throw new Error(
                    `AMIS Connection Failed: ${response.data.ErrorCode} - ${response.data.ErrorMessage}`
                );
            }

            // Parse Data string to object
            const tokenData: AmisTokenData = JSON.parse(response.data.Data);

            return tokenData;
        } catch (error: any) {
            if (error.response) {
                throw new Error(
                    `AMIS API Error: ${error.response?.data?.ErrorMessage || error.message}`
                );
            }
            throw error;
        }
    }

    /**
     * Kiểm tra token còn hiệu lực không
     * @param expiredTimeTicks - Thời gian hết hạn tính bằng ticks
     */
    public isTokenValid(expiredTimeTicks: number): boolean {
        const now = new Date();
        const nowTicks = now.getTime() * 10000 + 621355968000000000;
        return nowTicks < expiredTimeTicks;
    }

    /**
     * Gửi chứng từ bán hàng lên AMIS
     * POST /apir/sync/actopen/save
     * @param vouchers - Danh sách chứng từ bán hàng
     * @param accessToken - Access token từ connect()
     */
    public async saveVoucher(
        vouchers: SaVoucher[],
        accessToken: string
    ): Promise<SaveVoucherResponse> {
        try {
            const payload: SaveVoucherRequest = {
                app_id: this.appId,
                org_company_code: this.orgCompanyCode,
                voucher: vouchers
            };

            const response = await this.axiosInstance.post(
                '/apir/sync/actopen/save',
                payload,
                {
                    headers: {
                        'X-MISA-AccessToken': accessToken
                    }
                }
            );

            if (!response.data.Success) {
                throw new Error(
                    `AMIS Save Voucher Failed: ${response.data.ErrorMessage}`
                );
            }

            if (process.env.NODE_ENV === 'development') {
                logger.info('Voucher sent to AMIS successfully', response.data.Data);
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(
                    `AMIS API Error: ${error.response?.data?.ErrorMessage || error.message}`
                );
            }
            throw error;
        }
    }

    /**
     * Xóa chứng từ đã gửi lên AMIS
     * DELETE /apir/sync/actopen/delete
     * @param orgRefIds - Danh sách org_refid của các chứng từ cần xóa
     * @param accessToken - Access token từ connect()
     */
    public async deleteVoucher(
        orgRefIds: string[],
        accessToken: string
    ): Promise<any> {
        try {
            const vouchers = orgRefIds.map(id => ({
                voucher_type: 13, // Chứng từ bán hàng
                org_refid: id
            }));

            const payload = {
                app_id: this.appId,
                org_company_code: this.orgCompanyCode,
                voucher: vouchers
            };

            const response = await this.axiosInstance.delete(
                '/apir/sync/actopen/delete',
                {
                    data: payload,
                    headers: {
                        'X-MISA-AccessToken': accessToken
                    }
                }
            );

            if (!response.data.Success) {
                throw new Error(
                    `AMIS Delete Voucher Failed: ${response.data.ErrorMessage}`
                );
            }

            if (process.env.NODE_ENV === 'development') {
                logger.info(`Deleted ${orgRefIds.length} vouchers from AMIS`);
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(
                    `AMIS API Error: ${error.response?.data?.ErrorMessage || error.message}`
                );
            }
            throw error;
        }
    }

    /**
     * Kiểm tra lịch sử callback từ AMIS
     * POST /api/oauth/actopensupport/check_call_back_data
     */
    public async checkCallbackHistory(): Promise<CheckCallbackResponse> {
        try {
            const payload: CheckCallbackRequest = {
                app_id: this.appId,
                org_company_code: this.orgCompanyCode
            };

            const response = await this.axiosInstance.post(
                '/api/oauth/actopensupport/check_call_back_data',
                payload
            );

            if (!response.data.Success) {
                throw new Error(
                    `AMIS Check Callback Failed: ${response.data.ErrorMessage}`
                );
            }

            if (process.env.NODE_ENV === 'development') {
                logger.info('Callback history retrieved');
            }

            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(
                    `AMIS API Error: ${error.response?.data?.ErrorMessage || error.message}`
                );
            }
            throw error;
        }
    }

    /**
     * Tạo chữ ký SHA256 HMAC
     * @param data - Dữ liệu cần ký
     * @param key - Key để ký (app_id)
     */
    public generateSHA256HMAC(data: string, key: string): string {
        if (!data) {
            data = '';
        }

        const hmac = crypto.createHmac('sha256', key);
        hmac.update(data, 'utf8');
        return hmac.digest('hex').toLowerCase();
    }

    /**
     * Validate chữ ký callback từ AMIS
     * @param callbackData - Dữ liệu callback
     */
    public validateCallbackSignature(callbackData: CallbackDataInput): boolean {
        const expectedSignature = this.generateSHA256HMAC(
            callbackData.data,
            this.appId
        );
        return expectedSignature === callbackData.signature;
    }

    /**
     * Xử lý callback từ AMIS (async)
     * @param callbackData - Dữ liệu callback
     */
    public async processCallback(callbackData: CallbackDataInput): Promise<void> {
        // Log thông tin callback nhận được
        if (process.env.NODE_ENV === 'development') {
            logger.webhook('AMIS Callback Received', {
                app_id: callbackData.app_id,
                data_type: callbackData.data_type,
                org_company_code: callbackData.org_company_code,
                success: callbackData.success
            });
        }

        // Parse data từ JSON string
        let details: CallbackDataDetail[] = [];
        try {
            details = JSON.parse(callbackData.data);
        } catch (error) {
            logger.error('Failed to parse callback data', error);
            return;
        }

        // Xử lý theo loại callback
        switch (callbackData.data_type) {
            case CallBackDataType.SaveVoucher:
                await this.handleSaveVoucherCallback(details);
                break;
            case CallBackDataType.DeleteVoucher:
                await this.handleDeleteVoucherCallback(details);
                break;
            default:
                logger.warn('Unhandled callback type', { type: callbackData.data_type });
        }
    }

    /**
     * Xử lý callback SaveVoucher
     * @param details - Chi tiết các voucher
     */
    private async handleSaveVoucherCallback(details: CallbackDataDetail[]): Promise<void> {
        logger.info('Processing SaveVoucher Callback');

        for (const detail of details) {
            if (detail.success) {
                logger.info('Voucher saved successfully', {
                    org_refid: detail.org_refid,
                    session_id: detail.session_id,
                    voucher_type: detail.voucher_type
                });
            } else {
                logger.error('Voucher save failed', {
                    org_refid: detail.org_refid,
                    error_code: detail.error_code,
                    error_message: detail.error_message,
                    session_id: detail.session_id
                });
            }
        }
    }

    /**
     * Xử lý callback DeleteVoucher
     * @param details - Chi tiết các voucher
     */
    private async handleDeleteVoucherCallback(details: CallbackDataDetail[]): Promise<void> {
        logger.info('Processing DeleteVoucher Callback');

        for (const detail of details) {
            if (detail.success) {
                logger.info('Voucher deleted successfully', {
                    org_refid: detail.org_refid
                });
            } else {
                logger.error('Voucher delete failed', {
                    org_refid: detail.org_refid,
                    error_message: detail.error_message
                });
            }
        }
    }
}

export default new AmisService();
