#!/bin/bash

# MySQL Database Setup Script

echo "🔧 Setting up MySQL database for webhook queue..."

# Read MySQL credentials from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

MYSQL_HOST=${MYSQL_HOST:-localhost}
MYSQL_PORT=${MYSQL_PORT:-3306}
MYSQL_USER=${MYSQL_USER:-root}
MYSQL_DATABASE=${MYSQL_DATABASE:-middleware_integration}

echo "📦 Creating database if not exists..."
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p -e "CREATE DATABASE IF NOT EXISTS $MYSQL_DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "📋 Running schema.sql..."
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p "$MYSQL_DATABASE" < database/schema.sql

echo "✅ Database setup completed!"
echo ""
echo "Database: $MYSQL_DATABASE"
echo "Host: $MYSQL_HOST:$MYSQL_PORT"
echo "User: $MYSQL_USER"
