# 🤖 Govt Job Form Filler by AI — Chrome Extension

[![Chrome Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o%20%7C%20GPT--4o--mini-green.svg)](https://platform.openai.com/)
[![PDF.js](https://img.shields.io/badge/PDF.js-Client--Side-orange.svg)](https://mozilla.github.io/pdf.js/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An intelligent, privacy-first **Google Chrome Extension (Manifest V3)** that automates government job applications, profile questionnaires, and multi-step online forms using **OpenAI GPT**. Upload your CV (PDF, TXT, or JSON), scan complex web forms, and let AI evaluate and auto-select matching answers in real time.

---

## ✨ Key Features

- **📄 Direct CV / Resume Parsing:** Upload your resume in **PDF, TXT, or JSON** format. PDF text is extracted client-side using `pdf.js` with zero server dependency.
- **👥 Multi-Profile Management:** Save, manage, and switch between multiple candidate profiles using Mobile Number / Profile ID. Supports **Import & Export (JSON)**.
- **🧠 OpenAI GPT-Powered Auto-Fill:** Context-aware answer generation supporting `GPT-4o`, `GPT-4o Mini`, and `GPT-3.5 Turbo`.
- **🔍 Intelligent DOM Scanner:** Auto-detects form fields across pages, including:
  - Single-choice radio buttons
  - Multi-select checkboxes
  - Select dropdowns
  - Text inputs and textareas
- **⚡ Automated Form Execution:** Sequential answering with adjustable delay rates (ms), live progress bar, real-time activity log, and instant pause/stop controls.
- **🔒 100% Privacy & Security:** Your OpenAI API key and candidate data remain strictly inside your browser (`chrome.storage.local`). Direct communication with `api.openai.com` only.

---

## 📁 Repository Structure

```text
govt-job-form-fill/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── popup.html            # Extension popup UI (Dark Mode dashboard)
├── popup.js              # Application logic, profile manager, CV parser & OpenAI integration
├── content.js            # Injected DOM script for page scanning & element auto-fill
├── background.js         # Service worker handling extension lifecycle
├── pdf.min.js            # Mozilla PDF.js library for client-side PDF parsing
├── pdf.worker.min.js     # Web worker script for PDF.js
├── icons/                # Extension action & store icons (16px, 48px, 128px)
└── README.md             # Project documentation & setup instructions
```

---

## 📦 Installation (Developer Mode)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/imranbru99/govt-job-form-filler-ai.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Toggle on **Developer mode** in the top-right corner.
4. Click **"Load unpacked"** in the top-left toolbar.
5. Select the `govt-job-form-fill` project folder.
6. The extension icon will appear in your Chrome extensions menu! Pin it for quick access.

---

## ⚙️ Configuration & Setup

1. Click the extension icon to open the popup.
2. Switch to the **⚙️ API Settings** tab:
   - **Mobile Number (Profile ID):** Enter a mobile number or identifier to store your profile.
   - **Upload CV / Resume:** Click **Upload** to load a `.pdf`, `.txt`, or `.json` CV. The extension automatically extracts your career history, qualifications, and personal details into the profile field.
   - **OpenAI API Key:** Paste your OpenAI API key (`sk-...`). *(Keys are kept safely in your local browser storage).*
   - **Model Selection:** Choose between `GPT-4o Mini` (recommended for speed/cost) or `GPT-4o` (for complex comprehension).
   - **Delay (ms):** Adjust throttle delay between actions (default: `900ms`) to match application portal speeds.
   - Click **💾 Save Profile**.

---

## 🚀 How to Use

1. Navigate to any government job portal, recruitment form, or survey page.
2. Open the extension and go to the **⚡ Auto Answer** tab.
3. Click **🔍 Scan — Find All Nav Questions**:
   - The scanner will discover all interactive fields, questions, and choice lists on the current page.
4. Click **⚡ Auto Answer All Questions**:
   - The AI reviews each question alongside your uploaded CV profile and auto-selects or fills the most accurate response.
   - Monitor live status updates and percentage progress in real time.
   - Click **⛔ Stop** at any time to halt automated execution.

---

## 🤝 Let's Connect & Collaborate

I am open to **Senior Remote Full-Stack Roles**, **AI Platform Architecture Contracts**, and **Enterprise Technical Advisory**.

- **Timezone:** UTC+6 (Dhaka / Rangpur, Bangladesh) — Flexible overlap with US, UK, and European business hours.
- **Delivery Mode:** Async-ready, Slack, Discord, Jira, GitHub, and production-first accountability.

| Channel | Address / Handle | Quick Action |
| :--- | :--- | :--- |
| 🌐 **Primary Portfolio** | [imrandev.bd](https://imrandev.bd/) | [Visit Site ↗](https://imrandev.bd/) |
| 📦 **Packagist Packages** | [packagist.org/packages/imrandevbd/](https://packagist.org/packages/imrandevbd/) | [View Packages ↗](https://packagist.org/packages/imrandevbd/) |
| 💼 **LinkedIn Profile** | [linkedin.com/in/imranbru99](https://linkedin.com/in/imranbru99) | [Connect ↗](https://linkedin.com/in/imranbru99) |
| 🐙 **GitHub Profile** | [github.com/imranbru99](https://github.com/imranbru99) | [Follow ↗](https://github.com/imranbru99) |
| 💬 **WhatsApp Direct** | [+880 1576-918420](http://wa.me/+8801576918420) | [Chat Now ↗](http://wa.me/+8801576918420) |
| 📧 **Direct Email** | [me@imrandev.bd](mailto:me@imrandev.bd) | [Send Email ↗](mailto:me@imrandev.bd) |
| 🐦 **X (Twitter)** | [@imrandev_bd](https://x.com/imrandev_bd) | [Follow ↗](https://x.com/imrandev_bd) |
| 📺 **YouTube Tech** | [@ImranDevBD](https://youtube.com/@ImranDevBD) | [Subscribe ↗](https://youtube.com/@ImranDevBD) |
