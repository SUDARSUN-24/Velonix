# 🚗 Velonix Car Configurator (3D Web App)

An interactive 3D vehicle customization platform that allows users to design and visualize vehicles in real-time.

**🌐 Live demo: [velonixsun.vercel.app](https://velonixsun.vercel.app)**

![Velonix demo: live 3D showroom, model switching, a Launch Control run and the configurator](screenshots/demo.gif)

*Live 3D hero → drag to rotate and switch models → scroll into Launch Control and beat the factory 0–100 time → open the vehicle in the configurator.*

## 🔥 Overview
Velonix is a futuristic web-based configurator where users can:
- Select different vehicle models
- Customize colors, wheels, and engine types
- View real-time price updates
- Interact with a dynamic 3D environment

The home page is a live 3D showroom: the same Three.js studio that powers the configurator runs full-screen behind the page and the camera glides to a new angle for each section. It introduces the studio and has a **Launch Control** mini-game; all customizing happens in the configurator (the Lab).

This project demonstrates front-end development, UI/UX design, and 3D rendering using JavaScript.

---

## 🛠️ Tech Stack

- HTML5
- CSS3
- JavaScript (ES6)
- Three.js (3D Rendering)
- Lenis (smooth scrolling)
- Font Awesome (Icons)

---

## ⚙️ Features

- 🎨 Real-time vehicle customization
- 🚘 Multiple vehicle types (cars, bikes, trucks, and SUVs)
- 💰 Dynamic pricing system
- 📊 Live performance stats (speed, acceleration, handling)
- 🛰️ Live 3D home page: drag to rotate, switch models, scroll-driven camera
- 🏁 Launch Control mini-game: rev into the green zone, launch on the lights, shift on time and beat each vehicle's factory 0–100 (engine sound, best times saved per vehicle)
- 🔗 The vehicle on screen opens straight in the configurator
- 🎥 Interactive 3D rendering with orbit controls, interior views and materialize effects
- 🌗 Dark and light themes shared across pages
- 📱 Responsive design

---

## 📸 Screenshots

### Home: live 3D showroom

![Velonix home page with a live 3D car](screenshots/home.jpg)

### Launch Control
Hold to rev, keep the needle in the green zone when the light turns green, then tap when SHIFT flashes. The wheels spin, the floor rushes past and the camera shakes as you go. Mouse, touch and the Space key all work.

| Mid-run | Result |
|---------|--------|
| ![Launch Control during a run](screenshots/launch.jpg) | ![Launch Control result: Legend, new best](screenshots/launch-result.jpg) |

### About and the Lab

| About | The Lab |
|-------|---------|
| ![About section](screenshots/about.jpg) | ![The Lab section](screenshots/lab.jpg) |

### 3D Configurator Lab
Paint, wheels, lighting, interior and engine options with live pricing and performance stats.

![3D configurator](screenshots/configurator.jpg)

### Light Theme
The theme choice is shared between the home page and the configurator.

![Home page in light theme](screenshots/home-light.jpg)

### Mobile

<p align="center"><img src="screenshots/mobile.jpg" alt="Home page on mobile" width="520"></p>

---

## 🚀 Live Demo

👉 **[velonixsun.vercel.app](https://velonixsun.vercel.app)**, deployed on Vercel from the `main` branch.

| Page | Link |
|------|------|
| Home | [velonixsun.vercel.app](https://velonixsun.vercel.app) |
| Configurator | [velonixsun.vercel.app/customize.html](https://velonixsun.vercel.app/customize.html) |

---

## 📂 Project Structure
```
velonix-car-configurator/
│── index.html        # Home: live 3D showroom, About, Launch Control mini-game, Lab intro
│── customize.html    # 3D configurator lab (self-contained; ?showroom=1 = canvas-only mode used by Home)
│── site.css          # Home page styles
│── site.js           # Home page logic: drives the embedded 3D studio and runs Launch Control
│── customcar1.png    # Poster shown if WebGL is unavailable
└── screenshots/      # README screenshots
```


---

## 🧠 What I Learned

- Working with 3D graphics using Three.js  
- Managing application state in JavaScript  
- Building interactive UI components  
- Driving an embedded 3D scene from page scroll  
- Building a small game loop with Web Audio engine sound  

---

## 🔧 Future Improvements

- Save user configurations (localStorage)
- Backend integration for real orders
- User authentication system
- Database for storing builds
- Improved mobile responsiveness

---

## 👤 Author

Sudasun
- GitHub: https://github.com/SUDARSUN-24
- Portfolio: (add later)

---

## 📄 License
This project is for educational and portfolio purposes.
