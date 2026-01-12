import { Request, Response } from 'express';
import { AmisService } from '../services/amis.services';
import { CallbackDataInput, CallbackDataOutput, SaVoucher } from '../types/amis.types';
import amisTokenManager from '../services/amis-token-manager.services';
import logger from '../utils/logger';

const amisService = new AmisService();

export const connectToAmis = async (req: Request, res: Response) => {
    try {
        const tokenData = await amisService.connect();

        res.json({
            success: true,
            data: tokenData
        });
    } catch (error: any) {
        logger.error('AMIS connect error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Refresh token và lưu vào .env
 * POST /api/amis/refresh-token
 */
export const refreshToken = async (req: Request, res: Response) => {
    try {
        const token = await amisTokenManager.refreshToken();

        res.json({
            success: true,
            message: 'Token refreshed and saved to .env',
            token: token.substring(0, 20) + '...' // Chỉ hiện một phần token
        });
    } catch (error: any) {
        logger.error('Refresh token error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Lấy token hiện tại
 * GET /api/amis/token
 */
export const getCurrentToken = async (req: Request, res: Response) => {
    try {
        const token = await amisTokenManager.getValidToken();

        res.json({
            success: true,
            token: token.substring(0, 20) + '...',
            hasToken: !!token
        });
    } catch (error: any) {
        logger.error('Get token error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Callback endpoint - AMIS gọi vào để trả kết quả bất đồng bộ
 */
export const handleAmisCallback = async (req: Request, res: Response) => {
    const callbackData: CallbackDataInput = req.body;

    const result: CallbackDataOutput = {
        Success: true,
        ErrorMessage: ''
    };

    try {
        // Validate signature để đảm bảo đây là request từ AMIS
        const isValid = amisService.validateCallbackSignature(callbackData);

        if (!isValid) {
            result.Success = false;
            result.ErrorCode = 'InvalidParam';
            result.ErrorMessage = 'Signature invalid';

            // Log cảnh báo bảo mật
            logger.security('Invalid callback signature detected', {
                ip: req.ip
            });

            return res.json(result);
        }

        // Xử lý callback async (không chờ kết quả)
        // Trả response ngay để AMIS không phải chờ
        setImmediate(async () => {
            try {
                await amisService.processCallback(callbackData);
            } catch (error: any) {
                logger.error('Error processing callback', error);
            }
        });

        // Trả về success ngay lập tức
        res.json(result);

    } catch (error: any) {
        result.Success = false;
        result.ErrorCode = 'Exception';
        result.ErrorMessage = error.message;

        logger.error('Callback handler error', error);
        res.json(result);
    }
};

/**
 * Gửi chứng từ bán hàng lên AMIS
 * POST /api/amis/save-voucher
 */
export const saveVoucher = async (req: Request, res: Response) => {
    try {
        let { vouchers, access_token } = req.body;

        if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Vouchers array is required'
            });
        }

        // Nếu không truyền access_token, lấy từ token manager
        if (!access_token) {
            logger.debug('No access_token provided, using token from manager');
            access_token = await amisTokenManager.getValidToken();
        }

        const result = await amisService.saveVoucher(vouchers, access_token);

        res.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        logger.error('Save voucher error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Kiểm tra lịch sử callback từ AMIS
 * GET /api/amis/check-callback
 */
export const checkCallbackHistory = async (req: Request, res: Response) => {
    try {
        const result = await amisService.checkCallbackHistory();

        // Parse Data string to readable format
        let callbackData = [];
        if (result.Data) {
            try {
                const rawData = JSON.parse(result.Data);
                callbackData = rawData.map((item: any) => {
                    const callbackInfo = JSON.parse(item.call_back_data);
                    const details = JSON.parse(callbackInfo.data);

                    return {
                        app_id: callbackInfo.app_id,
                        success: callbackInfo.success,
                        data_type: callbackInfo.data_type,
                        org_company_code: callbackInfo.org_company_code,
                        details: details
                    };
                });
            } catch (parseError) {
                logger.error('Parse callback data error', parseError);
            }
        }

        res.json({
            success: true,
            data: {
                raw: result.Data,
                parsed: callbackData
            }
        });
    } catch (error: any) {
        logger.error('Check callback history error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Xóa chứng từ đã gửi lên AMIS
 * DELETE /api/amis/delete-voucher
 */
export const deleteVoucher = async (req: Request, res: Response) => {
    try {
        const { orgRefIds } = req.body;

        if (!orgRefIds || !Array.isArray(orgRefIds) || orgRefIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'orgRefIds array is required'
            });
        }

        // Lấy access token
        const accessToken = await amisTokenManager.getValidToken();

        if (!accessToken) {
            return res.status(500).json({
                success: false,
                error: 'Failed to get access token'
            });
        }

        // Xóa chứng từ
        const result = await amisService.deleteVoucher(orgRefIds, accessToken);

        res.json({
            success: true,
            message: `Deleted ${orgRefIds.length} vouchers successfully`,
            data: result
        });
    } catch (error: any) {
        logger.error('Delete voucher error', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
