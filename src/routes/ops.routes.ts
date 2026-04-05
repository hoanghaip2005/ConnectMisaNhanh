import { Router } from 'express';
import { ensureOpsAccess } from '../middleware/ops-auth.middleware';
import {
    getOpsDashboardPage,
    getOpsDashboardScript,
    getOpsLogs,
    getOpsManualOrderPage,
    getOpsManualOrderScript,
    getOpsOrderDetails,
    getOpsOverview,
    processOpsManualOrder
} from '../controllers/ops.controllers';

export const opsPageRouter = Router();
export const opsApiRouter = Router();

opsPageRouter.use(ensureOpsAccess);
opsPageRouter.get('/', getOpsDashboardPage);
opsPageRouter.get('/assets/app.js', getOpsDashboardScript);
opsPageRouter.get('/manual-order-sync', getOpsManualOrderPage);
opsPageRouter.get('/assets/manual-order.js', getOpsManualOrderScript);

opsApiRouter.use(ensureOpsAccess);
opsApiRouter.get('/overview', getOpsOverview);
opsApiRouter.get('/orders/:orderId', getOpsOrderDetails);
opsApiRouter.post('/orders/:orderId/process', processOpsManualOrder);
opsApiRouter.get('/logs/:type', getOpsLogs);

export default opsApiRouter;
