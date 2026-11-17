// GET /api/status
// Tells the Settings page which optional extras this copy has switched on,
// so its owner can see what is left to set up. Answers are yes/no only.
import { setupStatus } from './_lib/setup.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(setupStatus(process.env));
}
