/**
 * QURAN & AZAN MODULE
 * Req 11: Backend proxy with caching + rate limiting
 */
const router   = require('express').Router();
const axios    = require('axios');
const NodeCache = require('node-cache');
const { authenticate } = require('../../middleware/auth');

const cache = new NodeCache({ stdTTL: 86400 }); // 24h cache

// Quran text
router.get('/surah/:num', authenticate, async (req, res) => {
  try {
    const num = Number(req.params.num);
    if (num < 1 || num > 114) return res.status(400).json({ error: 'Invalid surah number (1-114)' });

    const cacheKey = `surah_${num}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const [ar, en] = await Promise.all([
      axios.get(`https://api.alquran.cloud/v1/surah/${num}`, { timeout: 8000 }),
      axios.get(`https://api.alquran.cloud/v1/surah/${num}/en.asad`, { timeout: 8000 })
    ]);

    const data = {
      arabic:  ar.data?.data,
      english: en.data?.data
    };
    cache.set(cacheKey, data);
    res.json({ source: 'api', data });
  } catch (e) {
    res.status(503).json({ error: 'Quran API unavailable', message: e.message });
  }
});

// Prayer times proxy
router.get('/prayer-times', authenticate, async (req, res) => {
  try {
    const { lat = '26.8467', lon = '80.9462', method = '1' } = req.query;
    const cacheKey = `prayers_${lat}_${lon}_${new Date().toDateString()}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const today = new Date();
    const url   = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth()+1}-${today.getFullYear()}?latitude=${lat}&longitude=${lon}&method=${method}`;
    const resp  = await axios.get(url, { timeout: 8000 });

    cache.set(cacheKey, resp.data.data);
    res.json({ source: 'api', data: resp.data.data });
  } catch (e) {
    res.status(503).json({ error: 'Prayer times API unavailable' });
  }
});

module.exports = router;
