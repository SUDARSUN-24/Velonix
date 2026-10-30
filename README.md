# 🚗 Velonix Car Configurator (3D Web App)

An interactive 3D vehicle customization platform that allows users to design and visualize vehicles in real-time.

**🌐 Live demo: [velonixsun.vercel.app](https://velonixsun.vercel.app)**

![Velonix demo: live 3D showroom, model switching, revving in the Engine Room and the configurator](screenshots/demo.gif)

*Live 3D hero → drag to rotate and switch models → rev it in the Engine Room, crank the volume to MAX, flash the lights and do a burnout → open the vehicle in the configurator.*

## 🔥 Overview
Velonix is a futuristic web-based configurator where users can:
- Select different vehicle models
- Customize colors, wheels, and engine types
- View real-time price updates
- Interact with a dynamic 3D environment

The home page is a live 3D showroom: the same Three.js studio that powers the configurator runs full-screen behind the page and the camera glides to a new angle for each section. It introduces the studio and has an **Engine Room** where you can rev each vehicle; all customizing happens in the configurator (the Lab).

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
- 🔊 Engine Room: a per-cylinder engine synth. The starter cranks, the engine catches, revs keep climbing without a limiter and it crackles on lift-off. Each vehicle sounds different: cross-plane V8 burble with turbo flutter, screaming V12, supercharger whine, diesel clatter with a blow-off hiss, high-revving inline-4. Volume goes up to MAX, plus horn, headlight flash and burnout
- 🎧 Sound check in the Lab: start your build and rev it; the power core (combustion, Ion Drive whine, Dark Matter drone) and the exhaust option change the sound
- ✨ Signature looks (six one-click themes), Surprise me, undo/redo and reset
- 🖌️ Hover a colour to try it on the car; any custom colour by picker or hex
- 💾 My Garage: save builds on your device, share a link to the exact build, export a branded image
- ⌨️ Keyboard shortcuts in the Lab (press `?`)
- 🔗 The vehicle on screen opens straight in the configurator
- 🎥 Interactive 3D rendering with orbit controls, interior views and materialize effects
- 🌗 Dark and light themes shared across pages
- 📱 Responsive design

---

## 📸 Screenshots

### Home: live 3D showroom

![Velonix home page with a live 3D car](screenshots/home.jpg)

### Engine Room
Hold to accelerate (or press Space): revs and speed keep climbing with no rev limiter or speed cap. The tachometer expands as needed. Lift off to coast and hear the crackle, or turn the volume all the way to MAX. Horn (H), Flash (F) and Burnout (B) make the 3D car react: the headlights blink, the driven wheels break traction and the camera shakes with the revs. All vehicles roll their wheels at their road speed, with tyre radius taken into account; the floor, neon streaks and dust move past as you accelerate. Both Home and the Lab show live speed in km/h.

The engine sound is synthesized live in an AudioWorklet (`engine-audio.js`). Every cylinder firing is a pressure pulse sent down tuned exhaust pipes; a cross-plane V8 splits its pulses unevenly across two banks, which gives it the burble. On top of that are intake roar, turbo whistle and compressor flutter, supercharger whine, diesel clatter, the starter motor, tuned firing harmonics, overrun pops and a short garage reverb.

| Revving | Volume at MAX + burnout |
|---------|-------------------------|
| ![Engine Room revving with exhaust crackle](screenshots/engine.jpg) | ![Engine Room at max volume during a burnout](screenshots/engine-max.jpg) |

### About and the Lab

| About | The Lab |
|-------|---------|
| ![About section](screenshots/about.jpg) | ![The Lab section](screenshots/lab.jpg) |

### 3D Configurator Lab
Paint, wheels, lighting, interior and engine options with live pricing and performance stats. Step through the tabs with Back / Next, pick a signature look, hover colours to preview them, then start the engine in the Power tab to hear your build and accelerate with unlimited revs. Wheels, body movement and the moving road follow your speed. The Summary tab saves builds to My Garage, copies a share link and exports an image.

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
│── index.html        # Home: live 3D showroom, About, Engine Room, Lab intro
│── customize.html    # 3D configurator lab (self-contained; ?showroom=1 = canvas-only mode used by Home)
│── site.css          # Home page styles
│── site.js           # Home page logic: drives the embedded 3D studio and the Engine Room
│── engine-audio.js   # Engine sound synth (AudioWorklet) and rev model, shared by Home and the Lab
│── customcar1.png    # Poster shown if WebGL is unavailable
└── screenshots/      # README screenshots
```


---

## 🧠 What I Learned

- Working with 3D graphics using Three.js  
- Managing application state in JavaScript  
- Building interactive UI components  
- Driving an embedded 3D scene from page scroll  
- Synthesizing engine sound with the Web Audio API and an AudioWorklet

---

## 🔧 Future Improvements

- Backend integration for real orders
- User authentication system
- Database for storing builds
- Improved mobile responsiveness

---

## 👤 Author

Sudasun
- GitHub: https://github.com/SUDARSUN-24

---

## 📄 License
This project is for educational and portfolio purposes.

## Validation

Run `node --test tests/engine-audio.test.cjs` to check uncapped acceleration, coasting, all power cores, and AudioWorklet output at extreme revs.
