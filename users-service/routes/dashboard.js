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

// Get milk settings
router.get('/MilkSettings/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Get user's device_id and threshold_wanted
    const userData = await db.query(`
      SELECT device_id, threshold_wanted FROM users WHERE id = ?
    `, [userId]);
    
    if (!userData.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const deviceId = userData[0].device_id;
    const thresholdWanted = userData[0].threshold_wanted;
    
    // Get expiry_date from user_stats
    const deviceStats = await db.query(`
      SELECT expiry_date FROM user_stats WHERE container_id = ?
    `, [deviceId]);
    
    res.json({
      success: true,
      userId: parseInt(userId),
      device_id: deviceId,
      threshold_wanted: thresholdWanted,
      expiry_date: deviceStats[0]?.expiry_date || null
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update milk settings
router.put('/MilkSettings', async (req, res) => {
  try {
    const { userId, device_id, threshold_wanted, expiry_date } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }
    
    // Update user's threshold_wanted
    if (threshold_wanted !== undefined) {
      await db.query(`
        UPDATE users 
        SET threshold_wanted = ? 
        WHERE id = ?
      `, [threshold_wanted, userId]);
    }
    
    // Update device's expiry_date in user_stats
    if (expiry_date !== undefined) {
      // Get user's device_id if not provided
      let deviceId = device_id;
      if (!deviceId) {
        const userDevice = await db.query(`
          SELECT device_id FROM users WHERE id = ?
        `, [userId]);
        deviceId = userDevice[0]?.device_id;
      }
      
      if (deviceId) {
        await db.query(`
          UPDATE user_stats 
          SET expiry_date = ? 
          WHERE container_id = ?
        `, [expiry_date, deviceId]);
      }
    }
    
    res.json({
      success: true,
      message: 'Milk settings updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;