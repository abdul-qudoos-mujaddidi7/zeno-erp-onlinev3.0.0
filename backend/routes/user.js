const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Update user preferences (language/theme)
router.post('/preferences', auth, async (req, res) => {
  const { language, theme } = req.body;
  const userId = req.user.id;

  try {
    const updates = [];
    const params = [];
    if (language) { updates.push('language = ?'); params.push(language); }
    if (theme) { updates.push('theme = ?'); params.push(theme); }
    if (!updates.length) return res.json({ message: 'No changes' });

    params.push(userId);
    const q = `UPDATE users_online SET ${updates.join(', ')} WHERE id = ?`;
    await db.execute(q, params);

    res.json({ message: 'Preferences updated', language, theme });
  } catch (err) {
    console.error('Preferences update failed', err);
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});

router.get('/pref', async (req, res) => {
  res.json({});

});

module.exports = router;
