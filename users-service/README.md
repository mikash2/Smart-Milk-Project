# Users Service

שירות ניהול משתמשים מלא עם מסד נתונים MySQL, אימות JWT, וניהול הרשאות.

## תכונות עיקריות

- ✅ ניהול משתמשים מלא (CRUD)
- ✅ אימות משתמשים עם JWT
- ✅ הצפנת סיסמאות עם bcrypt
- ✅ ניהול הרשאות (user, moderator, admin)
- ✅ וולידציה מקיפה של נתונים
- ✅ חיפוש וסינון משתמשים
- ✅ סטטיסטיקות משתמשים
- ✅ אבטחה מתקדמת (helmet, CORS)
- ✅ לוגים מפורטים
- ✅ טיפול שגיאות גלובלי

## דרישות מערכת

- Node.js (גרסה 16 ומעלה)
- MySQL (גרסה 5.7 ומעלה)
- npm או yarn

## התקנה

### 1. שכפול הפרויקט
```bash
git clone <repository-url>
cd users-service
```

### 2. התקנת תלויות
```bash
npm install
```

### 3. הגדרת מסד הנתונים
- צור מסד נתונים MySQL חדש
- הרץ את הקובץ `database/migration.sql` במסד הנתונים שלך

### 4. הגדרת משתני סביבה
צור קובץ `.env` בתיקיית הפרויקט:
```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=users_db
DB_PORT=3306

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Bcrypt Configuration
BCRYPT_ROUNDS=12
```

### 5. הפעלת השרת
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## מבנה הפרויקט

```
users-service/
├── database/
│   ├── connection.js      # חיבור למסד הנתונים
│   └── migration.sql      # מבנה מסד הנתונים
├── middleware/
│   ├── auth.js           # middleware לאימות
│   └── validation.js     # middleware לוולידציה
├── models/
│   └── User.js           # מודל המשתמש
├── routes/
│   ├── auth.js           # נתיבי אימות
│   └── users.js          # נתיבי ניהול משתמשים
├── services/
│   └── AuthService.js    # שירות אימות
├── config.js             # הגדרות
├── server.js             # השרת הראשי
├── package.json          # תלויות הפרויקט
└── README.md             # תיעוד
```

## API Endpoints

### אימות (Authentication)
- `POST /api/auth/register` - רישום משתמש חדש
- `POST /api/auth/login` - התחברות
- `POST /api/auth/logout` - התנתקות
- `POST /api/auth/refresh` - רענון טוקן
- `POST /api/auth/change-password` - שינוי סיסמה
- `POST /api/auth/reset-password` - איפוס סיסמה
- `GET /api/auth/profile` - פרופיל המשתמש הנוכחי

### ניהול משתמשים (Users Management)
- `GET /api/users` - קבלת כל המשתמשים (עם סינון ועמודים)
- `GET /api/users/:id` - קבלת משתמש לפי ID
- `POST /api/users` - יצירת משתמש חדש (admin only)
- `PUT /api/users/:id` - עדכון משתמש
- `DELETE /api/users/:id` - מחיקת משתמש (admin only)
- `PATCH /api/users/:id/status` - הפעלה/השבתת משתמש
- `GET /api/users/stats/overview` - סטטיסטיקות משתמשים (admin only)

## דוגמאות שימוש

### רישום משתמש חדש
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890"
  }'
```

### התחברות
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

### קבלת פרופיל משתמש
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### קבלת כל המשתמשים
```bash
curl -X GET "http://localhost:3000/api/users?page=1&limit=10&role=user" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## הרשאות (Roles)

### User (משתמש רגיל)
- צפייה בפרופיל שלו
- עדכון הפרופיל שלו
- שינוי סיסמה

### Moderator (מנחה)
- כל ההרשאות של User
- צפייה בכל המשתמשים
- הפעלה/השבתת משתמשים
- צפייה בסטטיסטיקות בסיסיות

### Admin (מנהל)
- כל ההרשאות של Moderator
- יצירת משתמשים חדשים
- מחיקת משתמשים
- שינוי תפקידים
- צפייה בסטטיסטיקות מלאות

## אבטחה

- **JWT Tokens**: אימות מאובטח עם טוקנים
- **Password Hashing**: הצפנת סיסמאות עם bcrypt
- **Input Validation**: וולידציה מקיפה של כל הקלט
- **CORS Protection**: הגנה מפני בקשות לא מורשות
- **Helmet**: אבטחה נוספת ל-HTTP headers
- **Rate Limiting**: הגבלת קצב בקשות (ניתן להוסיף)

## לוגים

השרת מייצר לוגים מפורטים עבור:
- בקשות HTTP
- שגיאות מסד נתונים
- פעולות אימות
- שגיאות כלליות

## בדיקות (Testing)

```bash
# הרצת בדיקות
npm test

# הרצת בדיקות עם צפייה בשינויים
npm run test:watch
```

## פריסה (Deployment)

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
הגדר את המשתנים הבאים בסביבת הייצור:
- `NODE_ENV=production`
- `JWT_SECRET` - מפתח JWT חזק ומורכב
- `DB_PASSWORD` - סיסמה חזקה למסד הנתונים

## תמיכה ועזרה

אם יש לך שאלות או בעיות:
1. בדוק את הלוגים של השרת
2. ודא שמסד הנתונים פועל ונגיש
3. בדוק שהמשתנים הסביבתיים מוגדרים נכון
4. פתח issue בפרויקט

## רישיון

MIT License - ראה קובץ LICENSE לפרטים נוספים.

## תרומה

תרומות יתקבלו בברכה! אנא:
1. Fork את הפרויקט
2. צור branch חדש לתכונה
3. Commit את השינויים
4. Push ל-branch
5. פתח Pull Request

---

**נבנה עם ❤️ ב-Node.js ו-MySQL**
