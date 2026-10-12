# ProjectNote

ProjectNote is a multi-user visual workspace for organizing projects, mapping steps and relationships, and collecting reusable tools, skills, and environments. Every account gets a personal workspace and can join multiple teams. It includes a Django REST API and a React/Vite web app.

## What It Does

- **Projects:** Build a visual project diagram from nested nodes such as steps, text, lists, and images. Arrange and connect nodes, then export project data as JSON.
- **Project groups:** Bring several projects together on a larger canvas. Add project cards, text annotations, and shapes; move items; and connect items with directional, loose, dependency, or bidirectional edges.
- **Catalogs:** Keep reusable tools, skills, and environments available while working on projects.
- **Reports:** Generate a Markdown project report with Google Gemini.
- **Settings:** Choose a color scheme, adjust accessibility preferences, configure Gemini, customize the report prompt, and review report data before sending it.
- **Accounts and teams:** Sign in with verified email/password or Google. Request team access during registration; a team admin approves it. Team admins can add existing accounts without email invitations. Switch workspaces from the navigation. Shared cards remain live and editable by active team members.
- **Card sharing:** Share projects, project groups, tools, skills, and environments with teams you belong to. Sharing a project group also shares the projects placed on its canvas; sharing a tool shares its linked skills.
- **Gemini keys:** Save separate personal and team keys. Team owners/admins manage the team key; members may select and use it for report generation.

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

## Run with Docker

Requirements: Docker Engine/Desktop with the Compose plugin.

1. Copy `.env.example` to `.env` and replace `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` with private random values.
2. From the repository root, build and start the stack:

	```sh
	docker compose up --build -d
	```

3. Open `http://localhost:8080/`. Nginx serves the React app and proxies `/api`, `/admin`, and `/static` to Django. PostgreSQL data is persisted in the `postgres_data` volume. The Docker database starts empty; the local `db.sqlite3` file is not copied into the container.
4. Configure the initial administrator once:

	```sh
	docker compose exec backend python manage.py setup_initial_admin --email you@example.com
	```

	The command prompts for the password privately. Local email verification links are printed in the backend logs (`docker compose logs -f backend`) when using the default console mail backend.

Useful commands:

```sh
docker compose logs -f
docker compose ps
docker compose down
```

`docker compose down` preserves the database volume. To deliberately delete all Docker database data, use `docker compose down -v`. Back up PostgreSQL before upgrades or moving the deployment to another machine.

### 2. Set up and start the web app

In a second terminal, from the repository root:

```sh
cd Frontend
npm ci
npm run dev
```

Open the Vite URL printed by the dev server, normally `http://localhost:5173/`. The npm script binds Vite to all interfaces. During development it proxies `/api` to Django at `127.0.0.1:8000`, so both `localhost` and `127.0.0.1` frontend URLs work without cross-origin session-cookie issues. For a production frontend, set `VITE_API_BASE_URL` to the deployed API base URL before building.

## First Administrator

After migrations, configure the initial administrator account created for the existing data:

```sh
python manage.py setup_initial_admin --email admin@example.com
```

The command prompts for a password without echoing it. Existing projects, groups, tools, skills, and environments are assigned to that account's personal workspace by the migration. The initial administrator can create teams and manage members in **Settings → Teams and members**. New account team requests remain pending until an owner/admin approves them. Run this command again with the same email to reset the admin password.

The initial administrator account has an unusable password until this command is run. Do not deploy publicly before configuring it and reviewing the security notes below.

## Google Sign-In

Set the same Google OAuth web client ID in the frontend build and Django environment:

```text
VITE_GOOGLE_CLIENT_ID=<Google OAuth web client ID>
GOOGLE_OAUTH_CLIENT_ID=<Google OAuth web client ID>
```

The frontend uses Google Identity Services. Django verifies the ID token server-side. A verified Google email links to an existing email/password account with the same email. For local testing, configure `VITE_GOOGLE_CLIENT_ID` in the frontend environment and `GOOGLE_OAUTH_CLIENT_ID` in the Django environment.

Password sign-up sends a signed verification link, and the account must be verified before password sign-in. In local development, Django prints the message and link to the API terminal because the default email backend is the console. For deployment, configure a real `EMAIL_BACKEND`, SMTP settings, `DEFAULT_FROM_EMAIL`, and `FRONTEND_URL`. Verification links expire after 24 hours. Existing accounts from before authentication were marked verified by migration.

## Gemini Reports

1. Start both the Django API and frontend.
2. Open **Settings → Google Gemini** in ProjectNote.
3. Enter a Google AI Studio API key and save it. ProjectNote tests the saved key and shows its verification status.
4. Open a project and choose **Generate report**.

On Windows, personal and team keys are stored as separate workspace-scoped entries in Windows Credential Manager and are never returned to the browser. Select the key workspace in **Settings → Google Gemini**. Team owners/admins manage the team key; active members can use it for report generation. For a server deployment, `GEMINI_API_KEY` is a personal-workspace fallback; team keys use the server account's OS credential store. `GEMINI_MODEL` can optionally select another supported model; the default is configured in `Backend/settings.py`.

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

The checked-in non-Docker Django defaults are for local development: SQLite, an in-memory cache, and `DEBUG = True`. Docker Compose uses PostgreSQL and defaults debug off. Before exposing either setup publicly, configure a private `DJANGO_SECRET_KEY`, set `DJANGO_ALLOWED_HOSTS`, configure production CORS/CSRF origins, and terminate TLS in a trusted reverse proxy. When serving HTTPS, set `SESSION_COOKIE_SECURE=true`, `CSRF_COOKIE_SECURE=true`, and `SECURE_PROXY_SSL_HEADER=true`. Team Gemini keys require a credential store accessible to the backend container/service account; the default container does not include a desktop keyring service. Do not put team keys in frontend build arguments or commit secrets to `.env`.
