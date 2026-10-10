# SPEC.md — Project Specification: PRAGYA AI

> **Status**: `FINALIZED`
> **Project Name**: PRAGYA AI — PLAY • LEARN • GROW
> **Domain**: Computer Science Gamified Education / 16-Bit Fantasy RPG Learning Platform
> **Tech Stack**: React 18 + Vite + TypeScript + Tailwind CSS + HTML5 2D Canvas + Web Audio API

---

## 1. Vision & Executive Summary
**PRAGYA AI** is a premium 16-bit pixel-art fantasy RPG educational gaming platform designed to transform Computer Science education. Rather than conventional static lectures, students embark on an epic quest through playable realms—coding to construct bridges, routing packets through treacherous network forests, unlocking collectible CS battle cards, receiving AI-guided hints from Pragya the Sage, and climbing the Hall of Masters leaderboard. Faculty members can curate and upload course resources through a dedicated Faculty Resource Studio.

---

## 2. Core Modules & Screen Inventory

### 2.1 Title Screen / Landing Page
- **Visuals**: Dynamic 16-bit RPG parallax hero scene featuring mountain silhouettes, floating grass-topped islands, drifting pixel clouds, a shimmering neon portal, and animated player & Pragya sprites.
- **Narrative**: *"PLAY • LEARN • GROW — Turn Computer Science concepts into adventures, challenges, and playable worlds."*
- **Actions**: "Enter the World", "Explore Worlds", and retro CRT scanline toggle.

### 2.2 Student Home Base
- **Game HUD**: Live indicator bars for Lives/Hearts (❤️ 3/3), XP (⭐), Coins/Gems (🪙), Streak (🔥), Player Level, and XP-to-next-level progress bar.
- **Current Mission Altar**: Highlights active objectives (e.g., *"Complete Loop Challenges in Python Kingdom"*).
- **Realm Gallery**: Unlocked vs. locked realm portal indicators.
- **Quick Travel**: One-click jumps to Worlds, AI Mentor Chamber, Knowledge Vault, and Battle Cards.

### 2.3 Interactive World Map
- **Worlds Displayed**:
  1. 🏰 **Python Kingdom** (Beginner - Variables, Conditions, Loops)
  2. 🌲📡 **Network Forest** (Networking - Routing, Packets, TCP/UDP)
  3. 🏙️ **Data Structure City** (Arrays, Stacks, Queues, Trees)
  4. ⚔️ **Algorithm Arena** (Sorting, Searching, Dynamic Programming)
  5. 🗝️ **Database Dungeon** (SQL, Normalization, Transactions)
  6. 🗼 **OS City** (Processes, Threads, Memory Scheduling)
- **Mechanics**: Animated river and floating islands with hovering tooltips, XP requirements, and unlock animations.

### 2.4 Playable Realm: Python Kingdom (2D Canvas Game)
- **Canvas View**: 640x320 pixelated 2D platformer engine running at 60 FPS.
- **Physics**: Gravity, platform collision, lateral velocity, jump mechanics, coin collection.
- **Educational Mechanic (Loops)**: Player encounters a canyon gap. Approaching the code console and pressing `[E]` executes `for i in range(N): activate()`, dynamically materializing floating platforms corresponding to `N`.
- **In-Game Dialog**: Speech bubbles from Pragya with context-aware teaching feedback.
- **Controls**: Dual input support (Keyboard: `Arrow keys`, `Space`, `E` + On-screen retro gamepad buttons `◀`, `▶`, `JUMP`, `E`).

### 2.5 Playable Realm: Network Forest (Packet Routing Puzzle)
- **Interactive Routing Grid**: Network topology displaying source Node A, destination Node B, and intermediate routers (R1, R2, R3, R4) with live status (online/offline).
- **Challenge**: Path selection puzzle where students click routing hops in sequence to avoid failed nodes and dispatch verified packets.

### 2.6 Pragya AI Chamber (Interactive Mentor)
- **Pixel Mentor Avatar**: Animated floating sage sprite with crystal energy.
- **Dialogue & Quick-Action Matrix**:
  - `EXPLAIN`: Clear conceptual breakdown of current topic.
  - `GIVE ME A HINT`: Scaffolded hints without giving away answers.
  - `WHY AM I WRONG?`: Diagnosis of recent incorrect attempts.
  - `PRACTICE THIS`: Adaptive challenge generator.
  - `EXAM PREPARATION`: High-yield revision points.
- **Custom Question Input**: Direct query bar with intelligent domain-specific responses.

### 2.7 Knowledge Vault (Curated Artifact Archive)
- **Interactive Storage Alcove**: Categorized storage containers:
  - ▶️ **Watch**: Video lectures & concept walkthroughs.
  - 📖 **Read**: Lecture notes, PPTs, e-books.
  - ✅ **Practice**: Question banks & interactive quizzes.
  - 📜 **Revise**: Previous question papers & solutions.
  - 📝 **Notes**: Student flash-sheets & cheat-sheets.
- **Modal Inspector**: Preview drawer with metadata, difficulty tag, and resource action buttons.

### 2.8 Battle Cards System
- **Collectible Deck**: Computer Science concept cards (Variable, Operator, If, Loop, Function, Debug, Router, Packet, IP, TCP, UDP, Firewall).
- **Card Anatomy**: Cost/Energy, Concept Icon, Title, Rarity tier (Common, Rare, Epic, Legendary), Attack (ATK), Defense (DEF), and Concept Ability effect.
- **Battle Arena Mockup**: Energy gauge (e.g., 5/10) with interactive duel simulation trigger.

### 2.9 Hall of Masters (Progress, Leaderboard & Achievements)
- **Leaderboard**: Top player podium with 🥇, 🥈, 🥉 rankings, player highlight, and XP tallies.
- **Achievement Showcase**: Retro pixel badges with unlock timestamps vs. locked status (Code Warrior 🛡️, Network Navigator 🧭, 7-Day Streak 🔥, Treasure Hunter 🪙, Algorithm Hunter ⚔️).

### 2.10 Faculty Resource Studio
- **Upload Drop Zone**: Drag-and-drop file uploader supporting `.pdf`, `.ppt`, `.pptx`, `.doc`, `.docx`, `.mp4`, `.txt`, `.md`.
- **Resource Metadata**: Course, Unit, Topic, Title, Description, Difficulty (Easy, Medium, Hard), Tags.
- **Lifecycle Management**: Save Draft, Preview, Publish, Unpublish, Archive, View as Student.

---

## 3. Visual & Aesthetic Architecture
- **Palette**: Deep cosmic indigo `#0b1030`, midnight royal `#141a4d`, wizard purple `#2a1b5e`, neon cyan `#38e8ff`, electric violet `#a35bff`, mystic magenta `#ff4fd8`, quest gold `#ffc83d`, terminal green `#4cff7a`, boss red `#ff4d6d`.
- **Typography**: Google Fonts `'Press Start 2P'` (Headers, HUD, buttons), `'VT323'` (Code terminals, numbers), and `'Inter'` (Long-form reading).
- **Pixel Rendering**: Crisp nearest-neighbor sprite scaling (`image-rendering: pixelated`), handcrafted SVG/Canvas matrix sprites, subtle CRT scanlines option, chiptune sound synthesis via Web Audio API.

---

## 4. Technical Constraints & Rules
- Frontend UI/UX focus with robust client-side mock data engines.
- Modular component-based structure ensuring smooth transitions, zero lag, and responsive design for both desktop and mobile viewports.
- State persistence using browser `localStorage` (XP, coins, unlocked levels, lives, cards, drafts).
