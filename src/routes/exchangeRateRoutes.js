import express from 'express';
import {
  getExchangeRates,
  setExchangeRate,
  getExchangeRateHistory,
} from '../controllers/exchangeRateController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getExchangeRates)
  .post(authorize('Super Admin', 'Accounts'), setExchangeRate);

router.route('/history')
  .get(getExchangeRateHistory);

export default router;
