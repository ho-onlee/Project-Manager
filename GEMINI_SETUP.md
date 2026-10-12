# Gemini Project Report Setup

Project reports use Google's `gemini-3.5-flash-lite` model through the Django API. Keys are saved per workspace in Windows Credential Manager and are never sent back to the browser.

## Configure Gemini

1. Create an API key in Google AI Studio: https://aistudio.google.com/app/apikey
2. Start the Django backend with `python manage.py runserver`.
3. Sign in to ProjectNote and select the personal or team workspace whose key you are configuring.
4. Open **Settings → Google Gemini**, paste the key, and select **Save key**. Team keys can only be changed by a team owner or admin.

The saved key is stored in the current Windows user's Credential Manager under a workspace-specific entry. ProjectNote only receives a configured/not-configured/verified status; the key itself is never returned. Do not put the key in frontend code, commit it to Git, or share it in chat.

For server deployments, `GEMINI_API_KEY` may be provided as a personal-workspace fallback environment variable. Team keys are stored in the server account's OS credential store under workspace-specific entries. To choose another supported model, set the optional `GEMINI_MODEL` environment variable. The default is `gemini-3.5-flash-lite`.

From the project library, choose **Generate report** beside **Download JSON**. ProjectNote sends that same project JSON and its titled, embedded pictures to Gemini using the key from the selected Gemini workspace. Gemini chooses where each picture best supports the report and the reader embeds the pictures at those placements. Up to 8 PNG, JPEG, or WebP pictures are supported, each up to 4 MB (12 MB total per report).