import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

function safeEqual(input: string, expected: string): boolean {
    const inputBuffer = Buffer.from(input);
    const expectedBuffer = Buffer.from(expected);

    if (inputBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function requestAuthentication(res: Response): void {
    res.setHeader('WWW-Authenticate', 'Basic realm="Operations Dashboard"');
    res.status(401).json({
        success: false,
        message: 'Authentication required'
    });
}

export function ensureOpsAccess(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Cache-Control', 'no-store');

    if (process.env.OPS_DASHBOARD_ENABLED !== 'true') {
        res.status(404).json({
            success: false,
            message: 'Not found'
        });
        return;
    }

    const username = process.env.OPS_DASHBOARD_USERNAME;
    const password = process.env.OPS_DASHBOARD_PASSWORD;

    if (!username || !password) {
        logger.warn('Ops dashboard requested but credentials are not configured');
        res.status(503).json({
            success: false,
            message: 'Ops dashboard credentials are not configured'
        });
        return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        requestAuthentication(res);
        return;
    }

    const encodedCredentials = authHeader.slice(6).trim();
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex === -1) {
        requestAuthentication(res);
        return;
    }

    const providedUsername = decodedCredentials.slice(0, separatorIndex);
    const providedPassword = decodedCredentials.slice(separatorIndex + 1);

    if (!safeEqual(providedUsername, username) || !safeEqual(providedPassword, password)) {
        logger.security('Invalid ops dashboard credentials', {
            ip: req.ip || req.socket.remoteAddress,
            path: req.originalUrl
        });
        requestAuthentication(res);
        return;
    }

    next();
}
