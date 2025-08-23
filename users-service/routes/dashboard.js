const express = require('express');
const router = express.Router();
const db = require('../database/connection');

router.get('/status', async (req, res) => {
  try {
    // דוגמה לשאילתות, תעדכן לפי מבנה הטבלאות שלך
    const [milk] = await db.query('SELECT amount, expiry_date FROM milk ORDER BY updated_at DESC LIMIT 1');
    const [coffee] = await db.query('SELECT cups_left FROM coffee ORDER BY updated_at DESC LIMIT 1');
    const [usage] = await db.query('SELECT AVG(daily_usage) AS avg_usage FROM milk_usage');
    const [sensor] = await db.query('SELECT is_active, serial_number FROM sensors WHERE type="weight" LIMIT 1');

    // חישוב יום סיום החלב
    const daysLeft = milk.amount / usage.avg_usage;
    const expectedEndDate = new Date();
    expectedEndDate.setDate(expectedEndDate.getDate() + daysLeft);

    res.json({
      currentMilkAmount: milk.amount,
      milkExpiryDate: milk.expiry_date,
      coffeeCupsLeft: coffee.cups_left,
      averageDailyConsumption: usage.avg_usage,
      expectedMilkEndDay: Math.ceil(daysLeft),
      expectedMilkEndDate: expectedEndDate.toISOString().split('T')[0],
      isWeightSensorActive: !!sensor.is_active,
      weightSensorSerialNumber: sensor.serial_number
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;