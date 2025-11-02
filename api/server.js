import express from 'express';
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8090;

app.use(cors());
app.use(express.json());

// Data directory (supports Docker volume mount)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultAuction = {
  name: 'Your Awesome Auction Name',
  endDateTime: null,
  announcements: [],
  askMeMode: false,
  askMeTitle: 'Ask Me Spotlight',
  askMeMessage: '',
  askMeTotal: 0,
  incentives: []
};

function normalizeIncentive(raw = {}, fallbackIndex = 0) {
  const normalized = { ...raw };
  if (!normalized.id || typeof normalized.id !== 'string') {
    normalized.id = raw.id && typeof raw.id === 'string' ? raw.id : randomUUID();
  }
  normalized.name = typeof normalized.name === 'string' ? normalized.name.slice(0, 200) : '';
  const numericTarget = Number(normalized.target);
  normalized.target = Number.isFinite(numericTarget) && numericTarget >= 0 ? numericTarget : 0;
  normalized.active = Boolean(normalized.active);
  normalized.displayNow = Boolean(normalized.displayNow);
  normalized.displayUntilMet = Boolean(normalized.displayUntilMet);
  return normalized;
}

const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter, { auction: { ...defaultAuction } });
await db.read();
await db.write();

// Helper to persist defaults
async function ensureDefaults() {
  db.data ||= {};
  db.data.auction ||= { ...defaultAuction };
  db.data.auction = { ...defaultAuction, ...db.data.auction };
  db.data.auction.announcements ||= [];
  db.data.auction.incentives = Array.isArray(db.data.auction.incentives)
    ? db.data.auction.incentives.map((item, idx) => normalizeIncentive(item, idx))
    : [];
  await db.write();
}


app.get('/api/auction', async (req, res) => {
  await ensureDefaults();
  res.json(db.data.auction);
});

app.get('/api/announcements', async (req, res) => {
  await ensureDefaults();
  res.json(db.data.auction.announcements);
});

app.put('/api/announcements', async (req, res) => {
  const { announcements } = req.body || {};
  if (!Array.isArray(announcements) || !announcements.every(a => typeof a === 'string' && a.length <= 200)) {
    return res.status(400).json({ error: 'announcements must be an array of strings (max 200 chars each)' });
  }
  await ensureDefaults();
  db.data.auction.announcements = announcements;
  await db.write();
  res.json(db.data.auction.announcements);
});

app.put('/api/auction', async (req, res) => {
  const { name, endDateTime, announcements, askMeMode, askMeTitle, askMeMessage, askMeTotal, incentives } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 200)) {
    return res.status(400).json({ error: 'name must be a non-empty string up to 200 chars' });
  }
  if (endDateTime !== undefined) {
    const d = new Date(endDateTime);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'endDateTime must be a valid ISO datetime string' });
    }
  }
  if (announcements !== undefined && (!Array.isArray(announcements) || !announcements.every(a => typeof a === 'string' && a.length <= 200))) {
    return res.status(400).json({ error: 'announcements must be an array of strings (max 200 chars each)' });
  }
  if (askMeMode !== undefined && typeof askMeMode !== 'boolean') {
    return res.status(400).json({ error: 'askMeMode must be a boolean' });
  }
  if (askMeTitle !== undefined && (typeof askMeTitle !== 'string' || askMeTitle.length > 120)) {
    return res.status(400).json({ error: 'askMeTitle must be a string up to 120 chars' });
  }
  if (askMeMessage !== undefined && (typeof askMeMessage !== 'string' || askMeMessage.length > 1200)) {
    return res.status(400).json({ error: 'askMeMessage must be a string up to 1200 chars' });
  }
  if (askMeTotal !== undefined) {
    const parsedTotal = typeof askMeTotal === 'number' ? askMeTotal : Number(askMeTotal);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      return res.status(400).json({ error: 'askMeTotal must be a non-negative number' });
    }
  }
  let normalizedIncentives;
  if (incentives !== undefined) {
    if (!Array.isArray(incentives)) {
      return res.status(400).json({ error: 'incentives must be an array' });
    }
    const normalized = [];
    for (let i = 0; i < incentives.length; i++) {
      const item = incentives[i];
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: `incentive at index ${i} must be an object` });
      }
      const incentive = normalizeIncentive(item, i);
      if (!incentive.name) {
        return res.status(400).json({ error: `incentive at index ${i} must have a name` });
      }
      normalized.push(incentive);
    }
    normalizedIncentives = normalized;
  }
  await ensureDefaults();
  if (name !== undefined) db.data.auction.name = name;
  if (endDateTime !== undefined) db.data.auction.endDateTime = endDateTime;
  if (announcements !== undefined) db.data.auction.announcements = announcements;
  if (askMeMode !== undefined) db.data.auction.askMeMode = askMeMode;
  if (askMeTitle !== undefined) db.data.auction.askMeTitle = askMeTitle;
  if (askMeMessage !== undefined) db.data.auction.askMeMessage = askMeMessage;
  if (askMeTotal !== undefined) db.data.auction.askMeTotal = Number(askMeTotal);
  if (normalizedIncentives !== undefined) db.data.auction.incentives = normalizedIncentives;
  await db.write();
  res.json(db.data.auction);
});

app.post('/api/incentives/:id/state', async (req, res) => {
  const { id } = req.params;
  const { displayNow, displayUntilMet, active } = req.body || {};
  await ensureDefaults();
  const incentives = db.data.auction.incentives || [];
  const incentive = incentives.find(item => item.id === id);
  if (!incentive) {
    return res.status(404).json({ error: 'incentive not found' });
  }
  if (displayNow !== undefined) {
    if (typeof displayNow !== 'boolean') {
      return res.status(400).json({ error: 'displayNow must be a boolean' });
    }
    incentive.displayNow = displayNow;
  }
  if (displayUntilMet !== undefined) {
    if (typeof displayUntilMet !== 'boolean') {
      return res.status(400).json({ error: 'displayUntilMet must be a boolean' });
    }
    incentive.displayUntilMet = displayUntilMet;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be a boolean' });
    }
    incentive.active = active;
  }
  await db.write();
  res.json(incentive);
});

app.listen(PORT, () => {
  console.log(`Auction Admin API listening on :${PORT}`);
});
