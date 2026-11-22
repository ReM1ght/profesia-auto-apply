# Profesia Auto Apply

Chrome extension for navigating job applications on `profesia.sk` and completing supported application steps.

## Overview

A Chrome MV3 extension for working through saved job tabs on `profesia.sk`.

## Features

- Processes open tabs from left to right
- Uses the application flow `Reagovať` → `Pokračovať` → `Odoslať`
- Handles optional confirmation checkboxes
- Keeps the queue active while the current tab is open
- Allows starting and stopping a session from the popup
- Displays sent, skipped, failed, and queued counts

## Requirements

- Google Chrome or a Chromium-based browser
- An active account on `profesia.sk`
- Applicant tabs opened in the browser before starting

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project directory.
5. Open `profesia.sk`, sign in, and prepare the job tabs.

## Usage

1. Open all desired job tabs.
2. Put the starting tab into focus.
3. Open the **Profesia Auto Apply** popup.
4. Select **Start**.
5. Keep the browser open and let the extension continue through the tabs.

Use **Stop** to end the session. If the website requires a manual CAPTCHA or verification, complete it in the affected tab and continue without stopping the queue.

## Project Structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension manifest |
| `background.js` | Tab ordering and queue coordination |
| `content.js` | Page interaction logic |
| `popup.html` | Extension popup markup |
| `popup.css` | Popup styles |
| `popup.js` | Popup controls and status updates |

## Development

This extension has no build step or external runtime dependencies. Edit the source files directly, then reload the unpacked extension from `chrome://extensions`.

## Responsible Use

Review each vacancy and application before submission. Use this tool only with accounts you are authorized to operate and in accordance with the website's terms of service.
