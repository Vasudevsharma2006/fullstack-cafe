# CAFE - Professional Cafe Management System

A comprehensive, full-featured Cafe management system built with **Node.js**, **Express**, and **EJS** templating engine. Designed for small to medium-sized coffee shops and Cafes.

## 🎯 Features

### Customer Features
- ☕ **Browse Menu** - View all Cafe items with descriptions and prices
- 🛒 **Place Orders** - Easy order placement with quantity selection
- 📦 **Order History** - Track all your orders and spending
- 👤 **User Authentication** - Secure login system

### Admin Features
- 📋 **Menu Management** - Add, edit, and delete menu items
- 📊 **Orders Dashboard** - View all orders with detailed analytics
- 👥 **Staff Management** - Manage Cafe staff members and roles
- 📈 **Reports & Analytics** - Comprehensive business insights
- 💰 **Revenue Tracking** - Monitor financial performance
- 📅 **Order Statistics** - Track orders over time

### UI/UX
- 🎨 **Modern Design** - Professional Bootstrap 5 interface
- 📱 **Responsive Layout** - Works perfectly on desktop, tablet, and mobile
- ✨ **Smooth Animations** - Polished user experience
- 🔐 **Secure** - Session-based authentication

## 📁 Project Structure

```
cafe/
├── app.js                 # Main Express application
├── package.json          # Project dependencies
├── public/
│   ├── css/
│   │   └── style.css     # Custom professional styles
│   └── js/
│       └── main.js       # Client-side functionality
├── views/
│   ├── auth/
│   │   └── login.ejs     # Login page
│   ├── home/
│   │   └── index.ejs     # Homepage
│   ├── customer/
│   │   ├── menu.ejs      # Browse menu
│   │   └── orders.ejs    # View orders
│   ├── admin/
│   │   ├── dashboard.ejs # Admin dashboard
│   │   ├── menu.ejs      # Manage menu items
│   │   ├── menu-edit.ejs # Edit menu item
│   │   ├── orders.ejs    # Manage orders
│   │   ├── staff.ejs     # Manage staff
│   │   └── reports.ejs   # Analytics & reports
│   ├── pages/
│   │   ├── about.ejs     # About page
│   │   └── contact.ejs   # Contact page
│   ├── layout.ejs        # Main layout template
│   └── 404.ejs          # Error page
└── README.md            # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. **Clone/Download the project**
   ```bash
   cd c:\Users\vs342\OneDrive\Desktop\internship project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the application**
   ```
   http://localhost:3001
   ```

## 🔐 Demo Credentials

### Admin Account
- **Username:** admin
- **Password:** admin123

### Regular User Account
- **Username:** user
- **Password:** user123

## 📍 Navigation Routes

### Public Routes
- `GET /` - Homepage
- `GET /menu` - Browse menu items
- `GET /about` - About page
- `GET /contact` - Contact page
- `GET /login` - Login page

### Customer Routes (Requires Authentication)
- `GET /orders` - View my orders
- `POST /orders/add` - Place a new order

### Admin Routes (Admin Role Required)
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/menu` - Manage menu items
- `POST /admin/menu/add` - Add menu item
- `GET /admin/menu/edit/:id` - Edit menu item
- `POST /admin/menu/edit/:id` - Save menu changes
- `GET /admin/menu/delete/:id` - Delete menu item
- `GET /admin/orders` - Manage orders
- `GET /admin/staff` - Manage staff
- `POST /admin/staff/add` - Add staff member
- `GET /admin/reports` - View reports & analytics

## 💻 Technologies Used

- **Backend:**
  - Node.js - JavaScript runtime
  - Express.js - Web framework
  - Body Parser - Request middleware

- **Frontend:**
  - EJS - Server-side templating
  - Bootstrap 5 - CSS framework
  - Font Awesome - Icons
  - Vanilla JavaScript - Interactivity

- **Session Management:**
  - Express Session - User sessions

## 🎨 Design Features

- **Color Scheme:** Professional brown and cream palette
- **Typography:** Clean, modern fonts
- **Animations:** Smooth fade-in and slide-in transitions
- **Responsive Grid:** Mobile-first design approach
- **Cards & Shadows:** Modern depth-based UI

## 📈 Future Enhancements

- [ ] Database integration (MongoDB/MySQL)
- [ ] Email notifications
- [ ] Payment gateway integration
- [ ] Advanced reporting with charts
- [ ] Customer loyalty program
- [ ] Inventory management
- [ ] Table reservations
- [ ] Mobile app version
- [ ] Multi-language support
- [ ] Dark mode toggle

## 🔧 Configuration

### Environment Variables
Currently, the application uses hardcoded settings. To add environment variables:

1. Install `dotenv`:
   ```bash
   npm install dotenv
   ```

2. Create `.env` file:
   ```
   PORT=3000
   NODE_ENV=development
   ```

### Database Setup
To connect a database, update the `app.js` file and replace in-memory data with database queries.

## 📝 API Documentation

### Menu Items Structure
```javascript
{
  id: 1,
  name: "Espresso",
  price: 2.50,
  category: "Coffee",
  description: "Rich and bold espresso shot",
  available: true
}
```

### Order Structure
```javascript
{
  id: 1,
  userId: 2,
  item: "Cappuccino",
  quantity: 2,
  price: 3.50,
  total: 7.00,
  date: "2/17/2026",
  time: "2:30:45 PM",
  status: "Pending"
}
```

### Staff Structure
```javascript
{
  id: 1,
  name: "John Doe",
  role: "Barista",
  email: "john@cafe.com",
  status: "Active"
}
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

This project is licensed under the ISC License.

## 📧 Support

For support, contact: info@cafe.com

---

**CAFE - Making Cafe Management Simple** ☕
