# Quantum Arena - Pool Tournament Platform

A comprehensive multiplayer pool tournament platform built with Next.js, featuring real-time gameplay, secure wallet integration, and tournament management.

## 🎱 Features

### Core Features
- **Multiplayer Pool Tournaments**: Competitive 8-ball pool matches with real-time gameplay
- **Secure Wallet System**: Integrated payment system with lipa namba support
- **Tournament Management**: Automated season generation and intelligent matchmaking
- **Player Profiles**: Comprehensive player statistics and achievement tracking
- **Live Matches**: Spectate ongoing tournaments and learn from top players
- **Admin Dashboard**: Complete back-office management with real-time analytics

### Technical Features
- **Modern Stack**: Next.js 14 with TypeScript, Tailwind CSS, and Shadcn/ui
- **Real-time Communication**: WebSocket integration for live gameplay
- **Microservices Architecture**: Scalable backend with dedicated services
- **Database Management**: PostgreSQL with Drizzle ORM
- **Authentication**: Secure JWT-based authentication system
- **Payment Integration**: Mobile money support with lipa namba

## 🏗️ Architecture

### Frontend Structure
```
frontend/
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── (auth)/           # Authentication pages
│   │   ├── dashboard/         # Player dashboard
│   │   ├── tournaments/      # Tournament management
│   │   ├── wallet/          # Wallet and payments
│   │   ├── game/            # Pool game pages
│   │   │   ├── practice/    # AI practice mode
│   │   │   ├── match/       # Multiplayer matches
│   │   │   └── pool/        # Free play table
│   │   └── admin/           # Admin dashboard
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # Shadcn/ui components
│   │   ├── forms/           # Form components
│   │   ├── layout/          # Layout components
│   │   └── pool/            # Pool game components
│   │       └── PoolGameCanvas.tsx  # Main game canvas
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility functions and API services
│   │   ├── pool/            # Pool game engine
│   │   │   └── engine.ts   # Physics & game logic
│   │   └── apiService.ts    # API client
│   └── types/               # TypeScript type definitions
```

### Backend Services
```
backend/
├── services/
│   ├── auth-service/        # Authentication & authorization
│   ├── player-service/      # Player management
│   ├── tournament-service/  # Tournament logic
│   ├── game-service/        # Game engine and physics
│   ├── wallet-service/      # Payment processing
│   └── matchmaking-service/ # Match pairing system
├── shared/                 # Shared utilities and types
└── api-gateway/           # API routing and middleware
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL database

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd quantum-arena
```

2. **Install dependencies**
```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

3. **Set up environment variables**
```bash
# Frontend
cp frontend/.env.example frontend/.env

# Backend
cp backend/.env.example backend/.env
```

4. **Start the development environment**
```bash
# Using Docker Compose (recommended)
cd backend
docker-compose up -d

# Or start services individually
npm run dev:all
```

5. **Access the application**
- Frontend: http://localhost:3000
- Practice Mode: http://localhost:3000/game/practice
- API Gateway: http://localhost:3001
- Admin Dashboard: http://localhost:3000/admin

## 🎱 Playing the Game

### Practice Mode

1. Navigate to `/game/practice` or click "Practice" from the game lobby
2. Select AI difficulty level (1-5)
3. Click and drag to aim your shot
4. Pull back further to increase power
5. Release to shoot

### Controls
- **Mouse/Touch**: Click and drag from cue ball to aim
- **Power**: Distance from cue ball determines shot power
- **Ball Placement**: Drag cue ball to place when ball-in-hand
- **AI Difficulty**: Adjust 1-5 for different challenge levels

### Game Rules (WPA 8-Ball)
- **Break**: Must hit 2 cushions or pocket a ball
- **Group Assignment**: First pocketed ball determines your group (solids/stripes)
- **Legal Shot**: Must hit your group first and hit a cushion or pocket a ball
- **8-Ball**: Pot after clearing your group to win
- **Fouls**: Scratches, wrong ball first, no cushion = ball-in-hand for opponent

## 🎮 Game Features

### 8-Ball Pool Game Engine
- **Canvas-Based Rendering**: High-performance HTML5 canvas rendering with 60 FPS
- **Realistic Physics**: Ball collisions, friction, cushion rebounds
- **AI Opponent**: 5 difficulty levels from Beginner to Expert
- **Practice Mode**: Play against AI to improve skills
- **Match Mode**: Multiplayer gameplay with real-time synchronization
- **Official Rules**: WPA 8-ball pool rules implementation
- **Responsive Controls**: Touch and mouse support for aiming and shooting

### AI Features
- **Smart Shot Calculation**: AI evaluates pocket angles and ball positions
- **Difficulty Scaling**: 
  - Level 1 (Beginner): Makes basic shots with high error margin
  - Level 2 (Easy): Improved accuracy, basic strategy
  - Level 3 (Medium): Good shot selection, moderate accuracy
  - Level 4 (Hard): Advanced positioning, high accuracy
  - Level 5 (Expert): Near-perfect play with strategic positioning
- **Intelligent Ball Placement**: AI places cue ball strategically when ball-in-hand
- **Break Strategy**: Varied break strength and positioning based on difficulty

### Tournament System
- **Automated Season Generation**: Creates tournament brackets automatically
- **Intelligent Matchmaking**: Pairs players based on skill level
- **Multiple Tournament Types**: Daily, weekly, and special events
- **Prize Distribution**: Automatic prize pool distribution to winners

### Payment System
- **lipa namba Integration**: Support for Tanzanian mobile money services
- **Multiple Payment Methods**: Mobile money, credit cards, bank transfers
- **Secure Transactions**: Encrypted payment processing
- **Transaction History**: Complete audit trail of all transactions

### Player Features
- **Profile Management**: Customizable player profiles
- **Statistics Tracking**: Win rates, earnings, and achievements
- **Skill Rating**: ELO-based rating system
- **Social Features**: Friend lists and chat functionality

## 🛠️ Development

### Available Scripts

#### Frontend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

#### Backend
```bash
npm run dev          # Start all services in development
npm run build        # Build all services
npm run test         # Run tests
npm run migrate      # Run database migrations
npm run seed         # Seed database with sample data
```

### Database Management
```bash
npm run db:migrate      # Run migrations
npm run db:generate     # Generate migration files
npm run db:studio       # Open Drizzle Studio
npm run db:seed         # Seed database
```

### Docker Development
```bash
docker-compose up -d              # Start all services
docker-compose logs -f [service]  # View service logs
docker-compose down                # Stop all services
```

## 📱 Mobile Integration

### lipa namba Payment Flow
1. **Initiate Payment**: User selects amount and mobile money provider
2. **Mobile Prompt**: Receive payment prompt on mobile device
3. **Confirm Transaction**: Enter PIN to authorize payment
4. **Instant Processing**: Funds added to wallet immediately
5. **Transaction Record**: Complete audit trail maintained

### Supported Providers
- Tigo Pesa
- Airtel Money
- Halotel Paisa
- M-Pesa

## 🔧 Configuration

### Environment Variables

#### Frontend (.env)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_ENVIRONMENT=development
```

#### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/quantum_arena

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# Payment (lipa namba)
LIPA_NAMBA_API_KEY=your-lipa-namba-api-key
LIPA_NAMBA_SECRET=your-lipa-namba-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## 🧪 Testing

### Frontend Tests
```bash
npm run test              # Run all tests
npm run test:unit         # Run unit tests
npm run test:e2e          # Run end-to-end tests
npm run test:coverage     # Generate coverage report
```

### Backend Tests
```bash
npm run test              # Run all service tests
npm run test:unit         # Unit tests
npm run test:integration  # Integration tests
npm run test:api          # API endpoint tests
```

## 📊 Monitoring

### Application Metrics
- **Real-time Analytics**: Dashboard for monitoring platform usage
- **Performance Metrics**: Response times and error rates
- **User Analytics**: Active users and engagement metrics
- **Financial Reports**: Revenue and transaction analytics

### Health Checks
- **Service Health**: Monitor all microservices
- **Database Status**: Connection and performance metrics
- **Payment Gateway**: lipa namba service availability
- **WebSocket Connections**: Real-time connection monitoring

## 🔒 Security

### Authentication & Authorization
- **JWT Tokens**: Secure token-based authentication
- **Role-Based Access**: Player, admin, and superadmin roles
- **Session Management**: Secure session handling
- **Password Security**: Bcrypt hashing and salt

### Payment Security
- **PCI Compliance**: Secure payment processing
- **Encryption**: End-to-end encryption for sensitive data
- **Fraud Detection**: Basic fraud prevention measures
- **Audit Trails**: Complete transaction logging

## 🚀 Deployment

### Production Deployment
```bash
# Build frontend
cd frontend
npm run build

# Build backend services
cd ../backend
npm run build

# Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Setup
- **Development**: Local development with Docker Compose
- **Staging**: Pre-production testing environment
- **Production**: Scalable deployment with load balancing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards
- **TypeScript**: Strong typing throughout the application
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit checks

## 📝 API Documentation

### Authentication Endpoints
```
POST /api/auth/register    # User registration
POST /api/auth/login       # User login
POST /api/auth/refresh     # Refresh JWT token
POST /api/auth/logout      # User logout
```

### Wallet Endpoints
```
GET /api/wallet/balance              # Get wallet balance
POST /api/wallet/deposit              # Add funds
POST /api/wallet/withdraw             # Withdraw funds
GET /api/wallet/transactions          # Transaction history
POST /api/wallet/lipa-namba/initiate  # lipa namba payment
```

### Tournament Endpoints
```
GET /api/tournaments                 # List tournaments
POST /api/tournaments/join           # Join tournament
GET /api/tournaments/[id]/matches    # Tournament matches
POST /api/tournaments/[id]/result    # Submit match result
```

## 🐛 Troubleshooting

### Common Issues

#### Docker Issues
```bash
# Clean up Docker
docker system prune -a
docker-compose down -v
docker-compose up --build
```

#### Database Issues
```bash
# Reset database
npm run db:reset
npm run db:migrate
npm run db:seed
```

#### Payment Issues
- Check lipa namba API credentials
- Verify webhook endpoints are accessible
- Ensure proper error handling for payment failures

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Next.js Team** - For the amazing React framework
- **Shadcn/ui** - For the beautiful UI components
- **Drizzle ORM** - For the excellent TypeScript ORM
- **lipa namba** - For the Tanzanian mobile money integration

## 📞 Support

For support and questions:
- Email: support@quantumarena.com
- Discord: [Join our Discord community]
- Documentation: [Visit our docs]

---

**Built with ❤️ for the Tanzanian gaming community**
