# AI Assignment Grader

An AI-powered web application that grades student assignment submissions against a rubric using the Claude AI API.

---

## Features

- Upload assignment task, grading rubric, and up to 30 student submissions (PDF or DOCX)
- AI grades each submission criterion-by-criterion using Claude Sonnet
- Colour-coded grade badges, progress bars, and expandable per-criterion feedback tables
- Download a formatted DOCX grade report

---

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | React (Vite) + Tailwind CSS v4          |
| Backend  | Node.js + Express                       |
| AI       | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Parsing  | pdf-parse (PDF), mammoth (DOCX)         |
| Reports  | docx                                    |

---

## Project Structure

```
grading-agent/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── FileUploader.jsx
│   │       ├── GradeReport.jsx
│   │       └── LoadingSpinner.jsx
│   ├── vite.config.js
│   └── package.json
├── server/                  # Express backend
│   ├── index.js
│   ├── routes/
│   │   └── grade.js
│   ├── services/
│   │   ├── parseFile.js
│   │   ├── gradeWithAI.js
│   │   └── generateReport.js
│   ├── .env                 # API key (not committed)
│   └── package.json
└── README.md
```

---

## Setup

### 1. Configure the API key

Edit `server/.env`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 2. Start the backend

```bash
cd server
npm install          # if not already done
npm run dev          # uses nodemon for auto-reload
# or: npm start
```

The API server starts at **http://localhost:5000**.

### 3. Start the frontend

```bash
cd client
npm install          # if not already done
npm run dev
```

The frontend starts at **http://localhost:5173**.

---

## Usage

1. Open **http://localhost:5173** in your browser.
2. Upload the **Assignment Task** document (PDF/DOCX).
3. Upload the **Grading Rubric** document (PDF/DOCX).
4. Upload one or more **Student Submissions** (PDF/DOCX, select all at once).
5. Enter student names in the textarea (one per line, matching submission order).
6. Click **Grade Submissions**.
7. Review the per-student cards with scores, grade badges, and detailed feedback.
8. Click **Download Grade Report (DOCX)** to save the formatted report.

---

## API Endpoints

| Method | Path            | Description                              |
|--------|-----------------|------------------------------------------|
| POST   | `/api/grade`    | Accepts files + studentNames, returns JSON array of grade results |
| GET    | `/api/download` | Downloads the most recently generated `grade-report.docx` |

---

## Customising the Grading Prompt

The system prompt sent to Claude is a single constant at the top of `server/services/gradeWithAI.js` (`GRADING_SYSTEM_PROMPT`). Edit it to adjust tone, strictness, output format requirements, etc.

---

## Notes

- Submissions are graded **in parallel** (`Promise.all`) to minimise wait time for large classes.
- If a student name is missing, the app defaults to `Student {n}`.
- The rubric can be a free-form text description **or** a structured table in a Word document — Claude interprets both formats.
