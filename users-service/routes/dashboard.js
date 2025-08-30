const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/status', async (req, res) => {
  try {
    console.log('Testing dashboard endpoint...');
    
    // First, let's see what tables exist
    const tables = await db.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    
    console.log('Available tables:', tables);
    
    // Check if user_stats table exists and what columns it has
    const userStatsColumns = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'user_stats'
    `);
    
    console.log('User stats columns:', userStatsColumns);
    
    // Check if weight_data table exists and what columns it has
    const weightDataColumns = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'weight_data'
    `);
    
    console.log('Weight data columns:', weightDataColumns);
    
    // For now, return a simple response with debug info
    const result = {
      currentMilkAmount: 0,
      milkExpiryDate: null,
      coffeeCupsLeft: 0,
      averageDailyConsumption: 0,
      expectedMilkEndDay: null,
      expectedMilkEndDate: null,
      isWeightSensorActive: false,
      weightSensorSerialNumber: null,
      percentFull: 0,
      debug: {
        tablesFound: tables,
        userStatsColumns: userStatsColumns,
        weightDataColumns: weightDataColumns
      }
    };

    console.log('Dashboard result:', result);
    res.json(result);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack,
      details: 'Database query failed'
    });
  }
});

module.exports = router;