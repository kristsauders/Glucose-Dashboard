import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import type { User, AuthRequest } from '../../types/index.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  diagnosisDate: z.string().optional(),
  diagnosisType: z.string().optional(),
  timezone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, diagnosisDate, diagnosisType, timezone } = signupSchema.parse(req.body);

    // Check if user exists
    const existing = await query<User>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await query<User>(
      `INSERT INTO users (email, password_hash, diagnosis_date, diagnosis_type, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, diagnosis_date, diagnosis_type, timezone, created_at`,
      [email, passwordHash, diagnosisDate || null, diagnosisType || null, timezone || null]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        diagnosisDate: user.diagnosis_date,
        diagnosisType: user.diagnosis_type,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const result = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        diagnosisDate: user.diagnosis_date,
        diagnosisType: user.diagnosis_type,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const result = await query<User>(
      'SELECT id, email, diagnosis_date, diagnosis_type, timezone, preferences FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Logout (client-side only, just return success)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
