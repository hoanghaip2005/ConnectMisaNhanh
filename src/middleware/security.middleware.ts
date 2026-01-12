// middleware/security.middleware.ts
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

/**
 * Rate limiter cho webhook endpoint
 * Cho phép IP của Nhanh.vn, chặn các IP khác
 */
export const webhookRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 1000, // Max 1000 requests/phút (đủ cho volume lớn)
    message: {
        success: false,
        error: 'Too many webhook requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,

    // Skip rate limit nếu từ IP tin cậy
    skip: (req: Request) => {
        // Danh sách IP của Nhanh.vn (cần update từ Nhanh support)
        const trustedIPs = (process.env.NHANH_WEBHOOK_IPS || '').split(',').map(ip => ip.trim());

        // Lấy IP thực của client (xử lý proxy)
        const clientIP = (
            req.headers['x-forwarded-for'] ||
            req.headers['x-real-ip'] ||
            req.socket.remoteAddress
        )?.toString().split(',')[0].trim();

        if (trustedIPs.length > 0 && clientIP && trustedIPs.includes(clientIP)) {
            logger.debug(`Rate limit skipping for trusted IP: ${clientIP}`);
            return true;
        }

        return false;
    },

    // Custom key generator
    keyGenerator: (req: Request) => {
        return (
            req.headers['x-forwarded-for'] ||
            req.headers['x-real-ip'] ||
            req.socket.remoteAddress
        )?.toString().split(',')[0].trim() || 'unknown';
    },

    // Handler khi vượt limit
    handler: (req: Request, res: Response) => {
        const clientIP = (
            req.headers['x-forwarded-for'] ||
            req.headers['x-real-ip'] ||
            req.socket.remoteAddress
        )?.toString().split(',')[0].trim();

        logger.security('Rate limit exceeded', { ip: clientIP });

        res.status(429).json({
            success: false,
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: 60 // seconds
        });
    }
});

/**
 * Rate limiter cho các API endpoints khác
 */
export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Max 100 requests/15 phút
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Request size limiter
 * Giới hạn kích thước request để tránh DoS
 */
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
    const maxSize = parseInt(process.env.MAX_REQUEST_SIZE || '10485760'); // 10MB default

    let size = 0;
    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxSize) {
            res.status(413).json({
                success: false,
                error: 'Request entity too large',
                message: `Maximum request size is ${maxSize} bytes`
            });
            req.pause();
            req.destroy();
        }
    });

    next();
};

/**
 * IP Whitelist middleware
 * Chỉ cho phép các IP được whitelist truy cập
 */
export const ipWhitelist = (req: Request, res: Response, next: NextFunction) => {
    // Chỉ enable trong production
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    const whitelistIPs = (process.env.WEBHOOK_WHITELIST_IPS || '').split(',').map(ip => ip.trim());

    if (whitelistIPs.length === 0) {
        logger.warn('No IP whitelist configured, allowing all IPs');
        return next();
    }

    const clientIP = (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.socket.remoteAddress
    )?.toString().split(',')[0].trim();

    if (!clientIP || !whitelistIPs.includes(clientIP)) {
        logger.security('IP whitelist blocked request', { ip: clientIP });
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Your IP is not whitelisted'
        });
    }

    next();
};

/**
 * Request validation middleware
 * Validate webhook request structure
 */
export const validateWebhookRequest = (req: Request, res: Response, next: NextFunction) => {
    const { event, businessId, data } = req.body;

    // Validate required fields
    if (!event || typeof event !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Missing or invalid "event" field'
        });
    }

    if (!businessId || typeof businessId !== 'number') {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Missing or invalid "businessId" field'
        });
    }

    if (!data || typeof data !== 'object') {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Missing or invalid "data" field'
        });
    }

    // Validate businessId matches expected
    const expectedBusinessId = parseInt(process.env.NHANH_BUSINESS_ID || '0');
    if (expectedBusinessId > 0 && businessId !== expectedBusinessId) {
        logger.security('BusinessId mismatch', {
            expected: expectedBusinessId,
            received: businessId
        });
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Invalid businessId'
        });
    }

    next();
};

/**
 * Replay attack protection
 * Chặn các request trùng lặp trong thời gian ngắn
 */
const recentRequests = new Map<string, number>();

export const replayProtection = (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-nhanh-signature'] as string;

    if (!signature) {
        return next(); // Sẽ bị reject ở signature validation
    }

    const now = Date.now();
    const lastSeen = recentRequests.get(signature);

    // Nếu đã thấy request này trong vòng 5 phút → reject
    if (lastSeen && (now - lastSeen) < 5 * 60 * 1000) {
        logger.security('Replay attack detected', {
            signaturePrefix: signature.substring(0, 10)
        });
        return res.status(409).json({
            success: false,
            error: 'Duplicate request',
            message: 'This request has already been processed'
        });
    }

    // Lưu signature này
    recentRequests.set(signature, now);

    // Cleanup old entries (sau 10 phút)
    if (recentRequests.size > 1000) { // Giới hạn memory
        const cutoff = now - 10 * 60 * 1000;
        for (const [sig, time] of recentRequests.entries()) {
            if (time < cutoff) {
                recentRequests.delete(sig);
            }
        }
    }

    next();
};

export default {
    webhookRateLimiter,
    apiRateLimiter,
    requestSizeLimiter,
    ipWhitelist,
    validateWebhookRequest,
    replayProtection
};
