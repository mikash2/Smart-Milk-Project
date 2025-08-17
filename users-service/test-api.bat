@echo off
echo Testing Users Service API...
echo.
echo Health Check:
curl -s http://localhost:3000/health
echo.
echo.
echo Testing Registration (if server is running):
curl -s -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"testuser\",\"email\":\"test@example.com\",\"password\":\"TestPass123\",\"first_name\":\"Test\",\"last_name\":\"User\"}"
echo.
echo.
pause
