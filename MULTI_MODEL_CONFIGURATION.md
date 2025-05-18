# Multi-Model Configuration for WhatsApp Bot

This document explains the multi-model AI configuration system for the WhatsApp bot.

## Overview

The WhatsApp bot now supports using different AI models for different tasks:

1. **Intent Detection**: A small, efficient model to determine the user's intention (chat, command, webhook)
2. **Chat Model**: For general conversations when no function execution is needed
3. **Function Model**: For executing commands or webhooks when requested

Each of these models can be configured separately to use either Ollama or OpenAI, and you can specify different model types for each purpose.

## Configuration

### Basic Setup

Set a default provider and model that will be used for all tasks unless overridden:

```
DEFAULT_AI_PROVIDER=ollama
DEFAULT_AI_MODEL=mi-bot
```

### Individual Model Configuration

You can override the default settings for each specific task:

#### Intent Detection

```
INTENT_AI_PROVIDER=ollama
INTENT_AI_MODEL=llama2
```

For intent detection, using a small, efficient model is recommended since this task is run first for every message and should be fast.

#### Chat Model

```
CHAT_AI_PROVIDER=openai
CHAT_AI_MODEL=gpt-3.5-turbo
```

For general chat, you might want to use a more capable model like GPT-3.5 or GPT-4 from OpenAI.

#### Function Model

```
FUNCTION_AI_PROVIDER=ollama
FUNCTION_AI_MODEL=mi-bot
```

For function execution, you should use a model that's been trained to understand your specific commands and webhooks.

## Mixed Configuration Examples

### Example 1: OpenAI for Chat, Ollama for the Rest

```
DEFAULT_AI_PROVIDER=ollama
DEFAULT_AI_MODEL=mi-bot

CHAT_AI_PROVIDER=openai
CHAT_AI_MODEL=gpt-3.5-turbo
```

### Example 2: Small Ollama Model for Intent, Larger Models for Everything Else

```
DEFAULT_AI_PROVIDER=ollama
DEFAULT_AI_MODEL=mistral

INTENT_AI_PROVIDER=ollama
INTENT_AI_MODEL=llama2
```

### Example 3: OpenAI for Everything

```
DEFAULT_AI_PROVIDER=openai
DEFAULT_AI_MODEL=gpt-3.5-turbo

FUNCTION_AI_MODEL=gpt-4
```

## How It Works

1. When a user sends a message, the **Intent Detection Model** first determines whether they want to:
   - Have a general conversation (CHAT)
   - Execute a command (COMMAND)
   - Control a device/service (WEBHOOK)

2. Based on the detected intent:
   - For CHAT: The **Chat Model** generates a conversational response
   - For COMMAND/WEBHOOK: The **Function Model** determines which function to call and its parameters

3. The appropriate action is taken based on the model's output

This approach optimizes resource usage by using lighter models when possible and only using more powerful models when necessary for complex tasks.
