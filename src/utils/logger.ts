/**
 * Safe Logger Utility
 * Tự động ẩn thông tin nhạy cảm trong production
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Get current time in Vietnam timezone (UTC+7)
 */
function getVietnamTime(): string {
    const now = new Date();
    // Convert to Vietnam timezone (UTC+7)
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vietnamTime.toISOString().replace('Z', '+07:00');
}

/**
 * Danh sách các key nhạy cảm cần che dấu
 */
const SENSITIVE_KEYS = [
    'password',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'secret',
    'apiKey',
    'api_key',
    'accessCode',
    'access_code',
    'Authorization',
    'x-nhanh-signature',
    'signature'
];

/**
 * Che dấu giá trị nhạy cảm
 */
function maskSensitiveValue(value: any): string {
    if (!value) return '[empty]';
    const str = String(value);
    if (str.length <= 8) return '***';
    return str.substring(0, 4) + '...' + str.substring(str.length - 4);
}

/**
 * Làm sạch object, che dấu thông tin nhạy cảm
 */
function sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = SENSITIVE_KEYS.some(k => lowerKey.includes(k.toLowerCase()));

        if (isSensitive) {
            sanitized[key] = maskSensitiveValue(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

class Logger {
    /**
     * Debug logs - Only in development
     * Use for verbose debugging info
     */
    debug(...args: any[]): void {
        if (isDevelopment && !isTest) {
            console.log('[DEBUG]', getVietnamTime(), ...args);
        }
    }

    /**
     * Info logs - Always logged, sanitized in production
     * Use for important application events
     */
    info(message: string, data?: any): void {
        if (isTest) return;

        if (data && isProduction) {
            console.log('[INFO]', getVietnamTime(), message, sanitizeObject(data));
        } else if (data) {
            console.log('[INFO]', getVietnamTime(), message, data);
        } else {
            console.log('[INFO]', getVietnamTime(), message);
        }
    }

    /**
     * Warning logs - Always logged
     * Use for potential issues
     */
    warn(message: string, data?: any): void {
        if (isTest) return;

        if (data && isProduction) {
            console.warn('[WARN]', getVietnamTime(), message, sanitizeObject(data));
        } else if (data) {
            console.warn('[WARN]', getVietnamTime(), message, data);
        } else {
            console.warn('[WARN]', getVietnamTime(), message);
        }
    }

    /**
     * Error logs - Always logged, sanitized in production
     * Use for errors
     */
    error(message: string, error?: any): void {
        if (isTest) return;

        if (isProduction) {
            // Production: Không show stack trace
            console.error('[ERROR]', getVietnamTime(), message, {
                message: error?.message || 'Unknown error',
                code: error?.code,
                statusCode: error?.statusCode
            });
        } else {
            // Development: Show full error
            console.error('[ERROR]', getVietnamTime(), message, error);
        }
    }

    /**
     * Sensitive logs - NEVER in production
     * Use for sensitive data like tokens, passwords, customer data
     */
    sensitive(label: string, data: any): void {
        if (isDevelopment) {
            console.log('[SENSITIVE]', getVietnamTime(), label, data);
        } else {
            console.log('[SENSITIVE]', getVietnamTime(), label, '[REDACTED]');
        }
    }

    /**
     * Webhook logs - Only in development
     * Use for webhook payloads
     */
    webhook(event: string, data: any): void {
        if (isDevelopment) {
            console.log('[WEBHOOK]', getVietnamTime(), event, JSON.stringify(data, null, 2));
        } else {
            console.log('[WEBHOOK]', getVietnamTime(), event, '[PAYLOAD REDACTED]');
        }
    }

    /**
     * Security logs - Always logged but sanitized in production
     * Use for security events
     */
    security(event: string, details?: any): void {
        if (isDevelopment && details) {
            console.log('[SECURITY]', getVietnamTime(), event, details);
        } else {
            console.log('[SECURITY]', getVietnamTime(), event);
        }
    }
}

export const logger = new Logger();

/**
 * Sanitize error messages for production
 */
export function sanitizeError(error: any): string {
    if (isDevelopment) {
        return error.message || 'Unknown error';
    }

    // Generic messages in production
    const message = error.message || '';

    if (message.includes('not found')) return 'Resource not found';
    if (message.includes('unauthorized') || message.includes('Unauthorized')) return 'Unauthorized access';
    if (message.includes('invalid') || message.includes('Invalid')) return 'Invalid request';
    if (message.includes('expired')) return 'Resource expired';
    if (message.includes('forbidden') || message.includes('Forbidden')) return 'Access forbidden';

    return 'An error occurred';
}

/**
 * Sanitize error response for API
 */
export function errorResponse(error: any) {
    return {
        success: false,
        message: sanitizeError(error),
        ...(isDevelopment ? {
            debug: {
                originalMessage: error.message,
                stack: error.stack
            }
        } : {})
    };
}

export default logger;
