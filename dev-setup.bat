@echo off
echo 🚀 CNS Bot Development Setup
echo ============================

if not exist ".env.dev" (
    echo ❌ .env.dev file not found!
    echo.
    echo Please create a .env.dev file with your development bot credentials.
    echo You can copy the example below and fill in your values:
    echo.
    echo DISCORD_CLIENT_ID=your_dev_client_id
    echo DISCORD_CLIENT_SECRET=your_dev_client_secret  
    echo DISCORD_TOKEN=your_dev_bot_token
    echo GUILD_ID=your_dev_guild_id
    echo LOG_CHANNEL_ID=your_dev_log_channel_id
    echo OAUTH_PORT=3000
    echo WELCOME_CHANNEL_ID=your_dev_welcome_channel_id
    echo NODE_ENV=development
    echo.
    pause
    exit /b 1
)

echo ✅ .env.dev file found
echo 📋 Copying .env.dev to .env...
copy .env.dev .env

echo ✅ Development environment ready!
echo.
echo To start the development bot:
echo   npm run dev
echo.
echo To start with PM2:
echo   npm run start:dev
echo.
pause 