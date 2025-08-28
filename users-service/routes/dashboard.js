const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/status', async (req, res) => {
  try {
    const s = req.app.locals.getSession(req);
    if (!s) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const [user] = await db.query(
      'SELECT id AS user_id, username, device_id FROM users WHERE id = ? LIMIT 1',
      [s.userId]
    );
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const [stats] = await db.query(
      'SELECT current_amount_g, avg_daily_consumption_g, cups_left, percent_full, expected_empty_date FROM user_stats WHERE user_id = ? LIMIT 1',
      [user.user_id]
    );

    const current_ml = stats?.current_amount_g ?? null;              // 1g ≈ 1ml (assumed)
    const avg_ml     = stats?.avg_daily_consumption_g ?? null;
    const percent    = stats?.percent_full ?? null;
    const predicted  = stats?.expected_empty_date ?? null;

    return res.json({
      success: true,
      user: { id: user.user_id, username: user.username, device_id: user.device_id },
      metrics: {
        milk_current_ml: current_ml,
        tank_capacity_ml: null,
        avg_daily_consumption_ml: avg_ml,
        avg_change_pct: null,
        delta_since_yesterday_ml: null,
        expiry_date: null,
        days_to_expiry: null,
        predicted_finish_date: predicted,
        days_to_finish: null,
        percent_full: percent,
        cup_size_ml: 200,
        sensor: {
          mqtt_connected: false,
          battery_pct: null,
          calibration_status: null,
          fw: null,
          last_seen: null
        }
      },
      events: []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;