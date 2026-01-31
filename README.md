# Coffee POS Backend API

Backend API server untuk aplikasi Coffee POS.

## Tech Stack
- Node.js + Express
- PostgreSQL (Supabase)
- Socket.IO (Real-time updates)

## Environment Variables

Buat file `.env` dengan isi:

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://your-supabase-connection-string
```

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm start
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/menu` - Get menu items
- `POST /api/orders` - Create order
- `GET /api/reports/dashboard` - Dashboard stats

## Deployment

Deploy ke Koyeb dengan environment variables yang sesuai.
