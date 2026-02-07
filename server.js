import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import db from './db.js'; // Universal DB Adapter

// Routes
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/order.js';
import reportRoutes from './routes/report.js';
import settingsRoutes from './routes/settings.js';
import expenseRoutes from './routes/expense.js';
import ingredientRoutes from './routes/ingredient.js';
import receiptRoutes from './routes/receipt.js';
import promoRoutes from './routes/promo.js';
import extraRoutes from './routes/extra.js';
import paymentRoutes from './routes/payment.js';
import { startAutoCancelScheduler } from './autoCancelOrders.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

const PORT = process.env.PORT || 3001; // FIXED PORT

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(join(__dirname, 'uploads')));
app.use('/downloads', express.static(join(__dirname, 'downloads')));
app.use('/qris', express.static(join(__dirname, 'uploads', 'qris')));

// Global Socket IO for Routes
app.set('io', io);

// =============================================
// ROOT & HEALTH CHECK
// =============================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Public Koffiee API</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0c0a09 0%, #1c1917 100%);
          color: #fafaf9;
        }
        .container {
          text-align: center;
          padding: 4rem;
          background: rgba(28, 25, 23, 0.8);
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: 2rem;
          max-width: 500px;
        }
        .logo { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem; }
        .tagline { color: #f59e0b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.3em; margin-bottom: 2rem; }
        .status { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 2rem; }
        .dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .endpoints { text-align: left; background: #0c0a09; padding: 1.5rem; border-radius: 1rem; font-size: 0.85rem; }
        .endpoints code { color: #f59e0b; }
        a { color: #f59e0b; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">☕</div>
        <h1>PUBLIC KOFFIEE</h1>
        <p class="tagline">API Server</p>
        <div class="status">
          <span class="dot"></span>
          <span>Server Online</span>
        </div>
        <div class="endpoints">
          <p><code>GET</code> <a href="/api/health">/api/health</a> - Health Check</p>
          <p><code>GET</code> /api/menu - Menu Items</p>
          <p><code>POST</code> /api/auth/login - Login</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Public Koffiee API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    sockets: io.engine.clientsCount
  });
});

// =============================================
// API ROUTES
// =============================================
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/extras', extraRoutes);
app.use('/api/payment', paymentRoutes);

// QRIS image endpoint
app.get('/api/qris/image', (req, res) => {
  const qrisPath = join(__dirname, 'uploads', 'qris');
  const possibleFiles = ['qris.png', 'qris.jpg', 'qris-payment.png', 'qris-payment.jpg', 'SAMPLE_QRIS.png'];

  if (!fs.existsSync(qrisPath)) {
    return res.status(404).json({ error: 'Uploads/qris directory missing' });
  }

  const files = fs.readdirSync(qrisPath);
  if (files.length > 0) {
    // Return the first file found in the directory
    return res.sendFile(join(qrisPath, files[0]));
  }

  res.status(404).json({ error: 'QRIS image not found. Please upload to /backend/uploads/qris/' });
});

// =============================================
// SOCKET.IO CONNECTION
// =============================================
io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);

  socket.on('join-admins', () => {
    socket.join('admins');
  });

  socket.on('join-cashiers', () => {
    socket.join('cashiers');
  });

  socket.on('new-order', (order) => {
    io.emit('new-order', order);
  });

  socket.on('order-update', (order) => {
    io.emit('order-updated', order);
  });

  socket.on('disconnect', () => {
    // console.log('❌ Client disconnected:', socket.id);
  });
});

// =============================================
// ERROR HANDLING
// =============================================
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// =============================================
// START SERVER
// =============================================
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ☕ ═══════════════════════════════════════════
     PUBLIC KOFFIEE - API SERVER (${db.type === 'postgres' ? 'CLOUD/PG' : 'LOCAL/SQLITE'})
  ═══════════════════════════════════════════
  
  🌐 Server    : http://0.0.0.0:${PORT}
  🔌 Socket.IO : Enabled
  📊 Database  : ${db.type.toUpperCase()}
  `);

  // Start auto-cancel scheduler for old unconfirmed orders  
  startAutoCancelScheduler();
});

export { io };
