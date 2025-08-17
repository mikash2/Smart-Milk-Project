# 🚀 התקנה מהירה - Users Service

## שלב 1: הגדרת מסד הנתונים MySQL

1. **התקן MySQL** אם עוד לא מותקן
2. **צור מסד נתונים חדש:**
   ```sql
   CREATE DATABASE users_db;
   ```
3. **הרץ את ה-migration:**
   - פתח MySQL Workbench או phpMyAdmin
   - הרץ את הקובץ `database/migration.sql`

## שלב 2: הגדרת משתני סביבה

צור קובץ `.env` בתיקיית הפרויקט:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=users_db
DB_PORT=3306
PORT=3000
NODE_ENV=development
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
```

## שלב 3: הפעלת השרת

```bash
# התקנת תלויות (אם עוד לא הותקנו)
npm install

# הפעלת השרת
npm start

# או להשתמש בקובץ start.bat
start.bat
```

## שלב 4: בדיקה

1. **בדיקת בריאות השרת:**
   ```
   http://localhost:3000/health
   ```

2. **בדיקת API:**
   - השתמש בקובץ `test-api.bat`
   - או בדוק ידנית עם Postman/curl

## 🔑 משתמש ברירת מחדל

לאחר הרצת ה-migration, תוכל להתחבר עם:
- **Email:** admin@example.com
- **Password:** admin123
- **Role:** admin

## 📚 API Endpoints

- **Health:** `GET /health`
- **Register:** `POST /api/auth/register`
- **Login:** `POST /api/auth/login`
- **Users:** `GET /api/users` (דורש אימות)

## ❗ בעיות נפוצות

1. **Database connection failed:**
   - ודא ש-MySQL פועל
   - בדוק את פרטי החיבור ב-.env

2. **Port already in use:**
   - שנה את הפורט ב-.env
   - או עצור שירות אחר שעובד על פורט 3000

3. **JWT errors:**
   - ודא שה-JWT_SECRET מוגדר ב-.env

## 🆘 עזרה

- בדוק את הלוגים בטרמינל
- ראה README.md מלא לפרטים נוספים
- ודא שכל התלויות הותקנו: `npm install`
