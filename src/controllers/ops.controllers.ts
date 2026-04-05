import { Request, Response } from 'express';
import opsDashboardService from '../services/ops-dashboard.services';
import logger from '../utils/logger';
import webhookController from './webhook.controller';
import {
    renderOpsDashboardPage,
    renderOpsDashboardScript
} from '../views/ops-dashboard.view';
import {
    renderManualOrderPage,
    renderManualOrderScript
} from '../views/ops-manual-order.view';

function parsePositiveInteger(input: string | string[] | undefined, fallbackValue: number): number {
    const normalizedInput = Array.isArray(input) ? input[0] : input;

    if (!normalizedInput) {
        return fallbackValue;
    }

    const parsed = parseInt(normalizedInput, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallbackValue;
    }

    return parsed;
}

export function getOpsDashboardPage(req: Request, res: Response): void {
    res.type('html').send(renderOpsDashboardPage(process.env.SERVER_URL));
}

export function getOpsDashboardScript(req: Request, res: Response): void {
    res.type('application/javascript').send(renderOpsDashboardScript());
}

export function getOpsManualOrderPage(req: Request, res: Response): void {
    res.type('html').send(renderManualOrderPage(process.env.SERVER_URL));
}

export function getOpsManualOrderScript(req: Request, res: Response): void {
    res.type('application/javascript').send(renderManualOrderScript());
}

export async function getOpsOverview(req: Request, res: Response): Promise<void> {
    try {
        const limit = Math.min(parsePositiveInteger(req.query.limit as string | undefined, 25), 100);
        const overview = await opsDashboardService.getOverview(limit);

        res.json({
            success: true,
            data: overview
        });
    } catch (error: any) {
        logger.error('Ops overview error', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Unable to load ops overview'
        });
    }
}

export async function getOpsOrderDetails(req: Request, res: Response): Promise<void> {
    try {
        const orderId = parsePositiveInteger(req.params.orderId, 0);

        if (!orderId) {
            res.status(400).json({
                success: false,
                message: 'Valid orderId is required'
            });
            return;
        }

        const details = await opsDashboardService.getOrderDetails(orderId);

        res.json({
            success: true,
            data: details
        });
    } catch (error: any) {
        logger.error('Ops order lookup error', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Unable to lookup order'
        });
    }
}

export async function getOpsLogs(req: Request, res: Response): Promise<void> {
    try {
        const type = req.params.type === 'error' ? 'error' : 'out';
        const lines = Math.min(parsePositiveInteger(req.query.lines as string | undefined, 120), 500);
        const logs = await opsDashboardService.getPm2Logs(type, lines);

        res.json({
            success: true,
            data: logs
        });
    } catch (error: any) {
        logger.error('Ops log read error', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Unable to read logs'
        });
    }
}

export async function processOpsManualOrder(req: Request, res: Response): Promise<void> {
    await webhookController.manualProcessOrder(req, res);
}
