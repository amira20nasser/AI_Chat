# AI Chat Demo

A lightweight browser-based AI assistant demo that supports both chat and image generation/editing using the Fireworks.ai API.

## Features

- Chat with an AI model via Fireworks.ai chat completions API
- Generate images from text prompts
- Edit an existing generated image with new instructions
- Session support with a sidebar for switching conversations
- Simple responsive UI built with HTML, CSS, and vanilla JavaScript

## Files

- `index.html` - main application UI and layout
- `Script.js` - application logic, API calls, and session management
- `styles.css` - optional custom styles (not currently used in the demo)

## Setup

1. Clone or download the project files.
2. Open `index.html` in a web browser.

## Usage

1. Select a mode from the top-right dropdown:
   - `chat` for text conversations
   - `image` for image generation/editing
2. Enter a prompt in the input field.
3. Press `Enter` or click the send button.

### Image mode behavior

- The first prompt in image mode generates a new image.
- Subsequent prompts edit the last generated image.

## Configuration

Edit `Script.js` to update the API settings in `CONFIG`:

- `apiKey` - your Fireworks.ai API key
- `chat.endpoint` - chat completion endpoint
- `image.generateEndpoint` - image generation endpoint
- `image.editEndpoint` - image editing submit endpoint
- `image.editResultEndpoint` - image edit polling endpoint

## Notes

- This project is a static web demo and runs entirely in the browser.
- The current API key in `Script.js` should be replaced with your own if you want to use the app.
- If image editing returns `task not found`, verify the returned job ID and poll endpoint configuration.

## License

This demo is provided as-is without warranty.
