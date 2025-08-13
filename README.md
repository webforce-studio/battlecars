# 🏎️ Battle Cars - Multiplayer Car Combat Arena

A real-time multiplayer car combat game built with Three.js and Socket.io, featuring arcade-style physics and arena-based battles.

## 🎮 Features

### Current (Stage 1 - POC)
- ✅ **3D Car Physics**: Arcade-style movement with quick acceleration
- ✅ **Oval Arena**: Beautiful arena with wall boundaries and advertisement panels
- ✅ **Health System**: Car health that decreases on collision
- ✅ **Simple Controls**: WASD movement, Space for boost
- ✅ **Visual Effects**: Dynamic lighting, shadows, and damage feedback
- ✅ **Responsive UI**: Health bar, player count, and controls display

### Planned (Stage 2+)
- 🔄 **Multiplayer Support**: Real-time battles with up to 8 players
- 🔄 **Car Upgrades**: Premium cars with different stats
- 🔄 **Monetization**: In-game purchases and advertisement space
- 🔄 **Tournament Mode**: Competitive gameplay with leaderboards
- 🔄 **Mobile Support**: Touch controls for mobile devices

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd battle-cars
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development servers**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

### Development Commands

```bash
# Start both client and server in development mode
npm run dev

# Start only the client (Vite dev server)
npm run client

# Start only the server
npm run server

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test
```

## 🎯 Game Controls

- **W / ↑**: Move forward
- **S / ↓**: Move backward  
- **A / ←**: Turn left
- **D / →**: Turn right
- **Space**: Boost (when moving forward)

## 🏗️ Project Structure

```
battle-cars/
├── src/
│   ├── game/
│   │   ├── Arena.js          # Oval arena with walls and ads
│   │   ├── Car.js            # Car physics and mechanics
│   │   ├── InputManager.js   # Keyboard input handling
│   │   └── GameUI.js         # UI management and overlays
│   └── main.js               # Main game engine
├── server/
│   └── index.js              # Express + Socket.io server
├── index.html                # Main HTML file
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite configuration
└── README.md                 # This file
```

## 🛠️ Technology Stack

### Frontend
- **Three.js**: 3D graphics and physics
- **Vite**: Fast development server and build tool
- **Socket.io Client**: Real-time communication

### Backend
- **Node.js**: Server runtime
- **Express**: Web framework
- **Socket.io**: Real-time multiplayer support
- **Helmet**: Security middleware
- **CORS**: Cross-origin resource sharing

### Development
- **ES6 Modules**: Modern JavaScript
- **CSS3**: Styling and animations
- **Git**: Version control

## 🎨 Game Design

### Arena
- **Shape**: Oval with flat asphalt surface
- **Size**: 160x120 units (80x60 radius)
- **Walls**: Transparent boundaries with advertisement panels
- **Atmosphere**: Sky blue background with fog effects

### Car Physics
- **Style**: Arcade-style for accessibility
- **Acceleration**: Quick response to input
- **Top Speed**: 30 units/second
- **Steering**: Smooth turning when moving
- **Boost**: 50% speed increase with Space key

### Health System
- **Starting Health**: 100%
- **Damage**: 10 points per wall collision
- **Visual Feedback**: Car color changes from green to red
- **Destruction**: Car disappears when health reaches 0

## 🔧 Development Roadmap

### Stage 1: Proof of Concept ✅
- [x] Basic car movement and physics
- [x] Arena environment
- [x] Health system and collision detection
- [x] UI elements and visual feedback

### Stage 2: MVP (In Progress)
- [ ] Multiplayer infrastructure
- [ ] Player synchronization
- [ ] Car upgrade system
- [ ] Payment integration
- [ ] Basic monetization

### Stage 3: Alpha Testing
- [ ] Enhanced car variety
- [ ] Power-ups and special abilities
- [ ] Sound effects and polish
- [ ] Analytics and monitoring

### Stage 4: Beta Launch
- [ ] Leaderboards and statistics
- [ ] Social features
- [ ] Mobile responsiveness
- [ ] Marketing preparation

### Stage 5: Production Release
- [ ] Advanced matchmaking
- [ ] Tournament modes
- [ ] Admin dashboard
- [ ] Performance optimization

## 🛡️ Security Features

- **Input Validation**: All user inputs are sanitized
- **Rate Limiting**: Prevents abuse and spam
- **CORS Protection**: Secure cross-origin requests
- **Content Security Policy**: XSS protection
- **Helmet.js**: Security headers
- **DDoS Protection**: Connection pooling and limits

## 📊 Performance

- **Target FPS**: 60 FPS on modern browsers
- **Memory Usage**: Optimized for low memory footprint
- **Network**: Efficient WebSocket communication
- **Mobile**: Responsive design with touch controls

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Three.js Community**: For the amazing 3D graphics library
- **Socket.io Team**: For real-time communication tools
- **Vite Team**: For the fast development experience
- **Cursor AI**: For AI-assisted development workflow

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/battle-cars/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/battle-cars/discussions)
- **Email**: support@battlecars.com

---

**Made with ❤️ using AI-assisted development and modern web technologies** 