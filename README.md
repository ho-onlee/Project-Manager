# ProjectNote

ProjectNote is a visual workspace for organizing projects, mapping steps and relationships, and collecting reusable tools, skills, and environments. It includes a Django REST API and a React/Vite web app.

## What It Does

- **Projects:** Build a visual project diagram from nested nodes such as steps, text, lists, and images. Arrange and connect nodes, then export project data as JSON.
- **Project groups:** Bring several projects together on a larger canvas. Add project cards, text annotations, and shapes; move items; and connect items with directional, loose, dependency, or bidirectional edges.
- **Catalogs:** Keep reusable tools, skills, and environments available while working on projects.
- **Reports:** Generate a Markdown project report with Google Gemini.
- **Settings:** Choose a color scheme, adjust accessibility preferences, configure Gemini, customize the report prompt, and review report data before sending it.

## Stack

- Backend: Python, Django, Django REST Framework, SQLite
- Frontend: React, Vite, Axios
- Gemini credentials: Windows Credential Manager for local Windows use, or the `GEMINI_API_KEY` environment variable on a server

## Requirements

- Python compatible with the Django version in `requirements.txt`
- Node.js and npm compatible with the Vite version in `Frontend/package.json`

## Run Locally

Open two terminals from the repository root.

### 1. Set up and start the API

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

macOS/Linux:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The API is available at `http://localhost:8000/api/`. The default database is a local SQLite file created as `db.sqlite3`.

### 2. Set up and start the web app

In a second terminal, from the repository root:

```sh
cd Frontend
npm ci
npm run dev
```

Open the Vite URL printed by the dev server, normally `http://localhost:5173/`.

## Gemini Reports

1. Start both the Django API and frontend.
2. Open **Settings → Google Gemini** in ProjectNote.
3. Enter a Google AI Studio API key and save it. ProjectNote tests the saved key and shows its verification status.
4. Open a project and choose **Generate report**.

On Windows, the key is stored in Windows Credential Manager and is never returned to the browser. For a server deployment, provide `GEMINI_API_KEY` in the server environment. `GEMINI_MODEL` can optionally select another supported model; the default is configured in `Backend/settings.py`.

See [GEMINI_SETUP.md](GEMINI_SETUP.md) for additional key setup details. Never commit API keys or add them to frontend code.

## Checks

Run backend tests from the repository root:

```sh
python manage.py test api.tests
```

Run frontend checks from `Frontend/`:

```sh
npm run lint
npm run build
```

## Deployment Notes

The checked-in Django settings are for local development: they use `DEBUG = True`, SQLite, an in-memory cache, and a development secret key. Before exposing the backend publicly, configure a private `SECRET_KEY`, disable debug mode, set `ALLOWED_HOSTS`, configure production CORS/CSRF origins, and choose persistent database/cache services appropriate for the deployment. Serve the frontend production build from `Frontend/dist/` using a web server or static host, and update the API base URL in `Frontend/src/api.js` for that environment.
