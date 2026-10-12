# Gemini Project Report Setup

Project reports use Google's `gemini-3.5-flash-lite` model through the Django API. The API key is saved in Windows Credential Manager and is never sent back to the browser.

## Configure Gemini

1. Create an API key in Google AI Studio: https://aistudio.google.com/app/apikey
2. Start the Django backend with `python manage.py runserver`.
3. Open **Settings** in ProjectNote, paste the key, and select **Save key**.WS

The saved key is stored in the current Windows user's Credential Manager. ProjectNote only receives a configured/not-configured status; the key itself is never returned. Do not put the key in frontend code, commit it to Git, or share it in chat.

For server deployments, `GEMINI_API_KEY` may be provided as an environment variable instead. To choose another supported model, set the optional `GEMINI_MODEL` environment variable. The default is `gemini-3.5-flash-lite`.

From the project library, choose **Generate report** beside **Download JSON**. ProjectNote sends that same project JSON to Gemini and downloads the returned report as Markdown.