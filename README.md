# Profesia Auto Apply

A Chrome extension that helps navigate job applications on `profesia.sk` and move through the available application steps.

## Features

- Processes open job tabs from left to right
- Supports the application sequence `Reagovať`, `Pokračovať` and `Odoslať`
- Handles optional confirmation checkboxes
- Keeps the queue active when manual verification is required
- Shows application, skip and failure counters

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project directory.
5. Sign in to `profesia.sk` and open the job tabs before starting the extension.

## Usage

Open the starting job tab, open the extension popup and select **Start**. Use **Stop** to end the session.

If the website asks for manual verification, complete it in the affected tab. The queue remains available after verification.

## Stack

- JavaScript
- Chrome Extensions API
- Manifest V3
- HTML and CSS
