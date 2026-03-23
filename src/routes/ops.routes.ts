import { Router } from 'express';
import { ensureOpsAccess } from '../middleware/ops-auth.middleware';
import {
    getOpsDashboardPage,
    getOpsDashboardScript,
    getOpsLogs,
    getOpsOrderDetails,
    getOpsOverview
} from '../controllers/ops.controllers';

export const opsPageRouter = Router();
export const opsApiRouter = Router();

opsPageRouter.use(ensureOpsAccess);
opsPageRouter.get('/', getOpsDashboardPage);
opsPageRouter.get('/assets/app.js', getOpsDashboardScript);

opsApiRouter.use(ensureOpsAccess);
opsApiRouter.get('/overview', getOpsOverview);
opsApiRouter.get('/orders/:orderId', getOpsOrderDetails);
opsApiRouter.get('/logs/:type', getOpsLogs);

export default opsApiRouter;
