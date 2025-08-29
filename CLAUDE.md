# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WizHire Interview Demo - A React-based interview application with voice activity detection (VAD) and Google GenAI integration. This is a TypeScript + React + Vite application with Tailwind CSS for styling.

## Development Commands

- **Start development server**: `npm run dev`
- **Build for production**: `npm run build` (runs TypeScript compilation followed by Vite build)
- **Lint code**: `npm run lint`
- **Preview production build**: `npm run preview`

## Architecture Overview

### Core Technologies
- **React 19** with TypeScript for the frontend
- **Vite** as the build tool and dev server
- **Tailwind CSS 4.1** for styling
- **@ricky0123/vad-react** for voice activity detection
- **@google/genai** for AI integration
- **wavefile** for audio processing

### Application Structure
- Single-page React application (`src/App.tsx`) with interview functionality
- Voice activity detection integration for audio input
- Google GenAI integration for AI-powered interview responses
- Session-based architecture with audio streaming capabilities

### Key Components
- **Main App**: Contains the interview interface with connection status, message display, and input controls
- **Session Management**: Handles starting/stopping interview sessions with audio processing
- **Message Queue**: Implements a response queue system for handling AI responses
- **Audio Handling**: Voice activity detection with audio chunk processing

### TypeScript Configuration
- Uses project references with separate configs for app (`tsconfig.app.json`) and Node (`tsconfig.node.json`)
- Strict TypeScript compilation with Vite build integration

### Styling
- Tailwind CSS with utility-first approach
- Material Symbols Sharp icons for UI elements
- Responsive design with flex layouts

## Development Notes

- The application uses modern React 19 features
- Audio functionality requires browser permissions for microphone access
- Google GenAI integration requires proper API authentication
- ESLint configured with React-specific rules and TypeScript support