import * as dashboardService from '../services/dashboard.service.js';


export const getDashboardData = async (req, res, next) => {
    try {
        const data = await dashboardService.getDashboardData(req.user.id);
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
};