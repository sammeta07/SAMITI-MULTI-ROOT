# BE2 - Fastify TypeScript MySQL Server

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

3. Create database:
```sql
CREATE DATABASE IF NOT EXISTS samiti;
USE samiti;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  state VARCHAR(100),
  district VARCHAR(100),
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

4. Run development server:
```bash
npm run dev
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/groups` - Get all groups
- `POST /api/groups` - Create group (requires auth)
- `GET /api/groups/:id` - Get group by ID
- `GET /api/groups/search?q=&state=&district=` - Search groups
