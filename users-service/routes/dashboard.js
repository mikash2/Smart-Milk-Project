const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.post('/status', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      console.log(`[dashboard] ❌ Request failed - Missing user ID`);
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    console.log(`[dashboard] 📊 Dashboard request for user ID: ${userId} - Processing...`);
    
    // Step 1: Get user's device_id from users table
    const userDevice = await db.query(`
      SELECT device_id FROM users 
      WHERE id = ?
    `, [userId]);
    
    if (!userDevice.length) {
      console.log(`[dashboard] ❌ Request failed - User ${userId} not found in database`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const deviceId = userDevice[0].device_id;
    
    // Step 2: Get device stats using container_id (device_id)
    const deviceStats = await db.query(`
      SELECT * FROM user_stats 
      WHERE container_id = ?
    `, [deviceId]);
    
    // Step 3: Get latest weight data for this device
    const weightData = await db.query(`
      SELECT * FROM weight_data 
      WHERE device_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [deviceId]);
    
    // Step 4: Use device stats (shared by all users of this device)
    const deviceStat = deviceStats[0] || {};
    
    const result = {
      success: true,
      userId: parseInt(userId),
      deviceId: deviceId,
      currentMilkAmount: deviceStat.current_amount_g || 0,
      coffeeCupsLeft: deviceStat.cups_left || 0,
      averageDailyConsumption: deviceStat.avg_daily_consumption_g || 0,
      expectedMilkEndDay: deviceStat.expected_empty_date || null,
      percentFull: deviceStat.percent_full || 0,
      isWeightSensorActive: (deviceStat.current_amount_g || 0) > 0,
      lastUpdated: weightData[0]?.timestamp || null
    };

    console.log(`[dashboard] ✅ Dashboard response sent - User: ${userId}, Device: ${deviceId}, Weight: ${result.currentMilkAmount}g, Cups: ${result.coffeeCupsLeft}, Status: 200`);
    res.json(result);
    
  } catch (error) {
    console.log(`[dashboard] ❌ Dashboard failed - User: ${userId}, Error: ${error.message}, Status: 500`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Database query failed'
    });
  }
});

module.exports = router;