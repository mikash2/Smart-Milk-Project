const express = require('express');
const router = express.Router();
const db = require('../database/connection');

// Change from GET to POST to send user ID in body
router.post('/status', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    console.log(`Dashboard request for user ID: ${userId}`);
    
    // Get user's device_id first
    const userDevice = await db.query(`
      SELECT device_id FROM users 
      WHERE id = ?
    `, [userId]);
    
    if (!userDevice.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const deviceId = userDevice[0].device_id;
    
    // Get user-specific stats
    const userStats = await db.query(`
      SELECT * FROM user_stats 
      WHERE user_id = ?
    `, [userId]);
    
    // Get latest weight data for this user's device
    const weightData = await db.query(`
      SELECT * FROM weight_data 
      WHERE device_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [deviceId]);
    
    // Calculate user-specific metrics
    const currentWeight = weightData[0]?.weight || 0;
    const userStat = userStats[0] || {};
    
    const result = {
      success: true,
      userId: parseInt(userId),
      deviceId: deviceId,
      currentMilkAmount: currentWeight,
      milkExpiryDate: userStat.expiry_date || null,
      coffeeCupsLeft: userStat.cups_left || 0,
      averageDailyConsumption: userStat.avg_daily_consumption_g || 0,
      expectedMilkEndDay: userStat.expected_empty_date || null,
      percentFull: userStat.percent_full || 0,
      isWeightSensorActive: currentWeight > 0,
      lastUpdated: weightData[0]?.timestamp || null
    };

    res.json(result);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Database query failed'
    });
  }
});

module.exports = router;