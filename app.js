const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");
const saltRounds = 10;
const app = express(); // Load users from JSON file

// MongoDB Connection
require("dotenv").config();
const mongodbUri = process.env.MONGODB_URI;

if (mongodbUri) {
  mongoose
    .connect(mongodbUri)
    .then(() => {
      console.log("✓ MongoDB connected successfully");
    })
    .catch((err) => {
      console.error("✗ MongoDB connection error:", err.message);
    });
} else {
  console.warn("⚠ MONGODB_URI not found in environment variables");
}
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";
const APP_ENV = process.env.NODE_ENV || "development";
const APP_VERSION = process.env.APP_VERSION || "1.1.0";
const ENABLE_REQUEST_LOGS = process.env.ENABLE_REQUEST_LOGS === "true";
const ENABLE_INFO_LOGS = process.env.ENABLE_INFO_LOGS === "true";
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;
const hasCustomSessionSecret =
  process.env.SESSION_SECRET &&
  process.env.SESSION_SECRET !== "change-this-secret";
const DEFAULT_USERS = [
  {
    id: 1,
    username: "admin",
    password: "$2b$10$vF8PFuzsbEmnC1PugP/J3OEGLy5y57artXpr6FykznScAQDmlbO8a", // admin123
    role: "admin",
    email: "admin@cafe.com",
  },
  {
    id: 2,
    username: "user",
    password: "$2b$10$RzZUg/X9xDLnG2ajUSgojOtnS7k5da8tkgEjSMeiQvBnaetkvcTUG", // user123
    role: "user",
    email: "user@cafe.com",
  },
];

if (APP_ENV === "production" && !hasCustomSessionSecret) {
  throw new Error(
    "SESSION_SECRET is required in production. Set a long random secret in environment variables.",
  );
}
if (APP_ENV !== "production" && !hasCustomSessionSecret && ENABLE_INFO_LOGS) {
  console.warn(
    "Using fallback SESSION_SECRET for local development. Set SESSION_SECRET in .env before deploying.",
  );
}

app.disable("x-powered-by");
const writeJsonAtomic = (filePath, payload) => {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
};
const appendLineAtomic = (filePath, line) => {
  fs.appendFileSync(filePath, `${line}\n`, { encoding: "utf8" });
};
let users = [];
const usersFilePath = path.join(__dirname, "data", "users.json");
const dataDirPath = path.join(__dirname, "data");
const auditLogFilePath = path.join(dataDirPath, "audit.log");
const loadUsers = () => {
  try {
    if (!fs.existsSync(dataDirPath)) {
      fs.mkdirSync(dataDirPath, { recursive: true });
    }
    if (fs.existsSync(usersFilePath)) {
      const data = fs.readFileSync(usersFilePath, "utf8");
      users = JSON.parse(data);
    } else {
      users = JSON.parse(JSON.stringify(DEFAULT_USERS));
      saveUsers();
    }
  } catch (err) {
    console.error("Error loading users:", err);
    users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  }
};
const saveUsers = () => {
  try {
    const dataDir = path.dirname(usersFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    writeJsonAtomic(usersFilePath, users);
  } catch (err) {
    console.error("Error saving users:", err);
  }
};

const migrateLegacyPlaintextPasswords = () => {
  let hasChanges = false;
  users.forEach((user) => {
    const rawPassword = String(user?.password || "");
    if (!BCRYPT_HASH_REGEX.test(rawPassword)) {
      const safeFallback = rawPassword || crypto.randomUUID();
      user.password = bcrypt.hashSync(safeFallback, saltRounds);
      hasChanges = true;
    }
  });
  if (hasChanges) {
    saveUsers();
  }
};

// Initialize users on startup
loadUsers();
migrateLegacyPlaintextPasswords();

// Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const extByMime = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const extension = extByMime[file.mimetype];
    const safeName = `${Date.now()}-${crypto.randomUUID()}${extension || ""}`;
    cb(null, safeName);
  },
});
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    if (!allowedMimes.has(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG, WEBP, or GIF image files are allowed"),
        false,
      );
    }
    cb(null, true);
  },
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: APP_ENV === "production" ? "7d" : 0,
    etag: true,
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: APP_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  const start = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    if (APP_ENV !== "test" && ENABLE_REQUEST_LOGS) {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms id=${req.requestId}`,
      );
    }
  });
  next();
});
app.use((req, res, next) => {
  if (!isMutatingMethod(req.method)) return next();
  const origin = req.get("origin");
  const host = req.get("host");
  // Allow same-origin or non-browser clients without Origin header.
  if (origin && host && !origin.includes(host)) {
    return sendApiError(res, "Blocked cross-origin request.", 403);
  }
  return next();
});
app.use((req, res, next) => {
  res.on("finish", () => {
    if (!isMutatingMethod(req.method)) return;
    if (req.session?.role !== "admin") return;
    appendAuditLog({
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      actor: req.session.username || `User#${req.session.userId || "unknown"}`,
      role: req.session.role,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ip: req.ip,
    });
  });
  next();
});

// Basic in-memory auth rate limiter
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const getClientKey = (req) =>
  `${req.ip || "unknown"}:${(req.body?.username || "").toLowerCase()}`;
const isLoginRateLimited = (key) => {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now > current.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return current.count >= LOGIN_MAX_ATTEMPTS;
};
const registerLoginAttempt = (key, success) => {
  const now = Date.now();
  const current = loginAttempts.get(key) || {
    count: 0,
    resetAt: now + LOGIN_WINDOW_MS,
  };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + LOGIN_WINDOW_MS;
  }
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  current.count += 1;
  loginAttempts.set(key, current);
};

// Menu item persistence
const menuFilePath = path.join(__dirname, "data", "menu.json");
const defaultMenuItems = [
  {
    id: 1,
    name: "Espresso",
    price: 207.5,
    category: "Coffee",
    description: "Rich and bold espresso shot",
    available: true,
    image:
      "https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&h=400&fit=crop",
  },
  {
    id: 2,
    name: "Cappuccino",
    price: 290.5,
    category: "Coffee",
    description: "Espresso with steamed milk and foam",
    available: true,
    image:
      "https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=400&fit=crop",
  },
  {
    id: 3,
    name: "Latte",
    price: 311.25,
    category: "Coffee",
    description: "Smooth espresso with velvety milk",
    available: true,
    image:
      "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=400&h=400&fit=crop",
  },
  {
    id: 4,
    name: "Americano",
    price: 228.25,
    category: "Coffee",
    description: "Espresso shots with hot water",
    available: true,
    image:
      "https://images.unsplash.com/photo-1551030173-122aabc4489c?w=400&h=400&fit=crop",
  },
  {
    id: 5,
    name: "Macchiato",
    price: 269.75,
    category: "Coffee",
    description: "Espresso marked with milk foam",
    available: true,
    image:
      "https://images.unsplash.com/photo-1610632380989-680fe40816c6?w=400&h=400&fit=crop",
  },
  {
    id: 6,
    name: "Croissant",
    price: 249.0,
    category: "Pastry",
    description: "Buttery French pastry",
    available: true,
    image:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop",
  },
  {
    id: 7,
    name: "Muffin",
    price: 228.25,
    category: "Pastry",
    description: "Freshly baked chocolate muffin",
    available: true,
    image:
      "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&h=400&fit=crop",
  },
  {
    id: 8,
    name: "Sandwich",
    price: 456.5,
    category: "Food",
    description: "Grilled cheese sandwich",
    available: true,
    image:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop",
  },
  {
    id: 9,
    name: "Salad",
    price: 498.0,
    category: "Food",
    description: "Fresh garden salad",
    available: true,
    image:
      "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=400&fit=crop",
  },
  {
    id: 10,
    name: "Iced Coffee",
    price: 290.5,
    category: "Cold Drinks",
    description: "Refreshing cold coffee",
    available: true,
    image:
      "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=400&h=400&fit=crop",
  },
  {
    id: 11,
    name: "Butter Chicken",
    price: 746.17,
    category: "Indian",
    description: "Tender chicken in creamy tomato sauce",
    available: true,
    image:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop",
  },
  {
    id: 12,
    name: "Tandoori Chicken",
    price: 788.5,
    category: "Indian",
    description: "Grilled chicken with tandoori spices",
    available: true,
    image:
      "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop",
  },
  {
    id: 13,
    name: "Biryani",
    price: 912.17,
    category: "Indian",
    description: "Fragrant basmati rice with meat",
    available: true,
    image:
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=400&fit=crop",
  },
  {
    id: 14,
    name: "Samosa",
    price: 373.5,
    category: "Indian",
    description: "Crispy pastry with potato filling",
    available: true,
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=400&fit=crop",
  },
  {
    id: 15,
    name: "Paneer Tikka",
    price: 705.5,
    category: "Indian",
    description: "Grilled cheese cubes",
    available: true,
    image:
      "https://images.unsplash.com/photo-1628294895950-98052523e036?w=400&h=400&fit=crop",
  },
  {
    id: 16,
    name: "Naan",
    price: 290.5,
    category: "Indian",
    description: "Soft Indian bread",
    available: true,
    image:
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=400&fit=crop",
  },
  {
    id: 17,
    name: "Masala Dosa",
    price: 663.17,
    category: "Indian",
    description: "Crispy crepe with potato filling",
    available: true,
    image:
      "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&h=400&fit=crop",
  },
  {
    id: 18,
    name: "Chai",
    price: 248.17,
    category: "Indian Beverages",
    description: "Spiced Indian tea",
    available: true,
    image:
      "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&h=400&fit=crop",
  },
  {
    id: 19,
    name: "Pakora",
    price: 456.5,
    category: "Indian",
    description: "Crispy vegetable fritters",
    available: true,
    image:
      "https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=400&h=400&fit=crop",
  },
  {
    id: 20,
    name: "Gulab Jamun",
    price: 414.17,
    category: "Indian Desserts",
    description: "Milk solids in sugar syrup",
    available: true,
    image:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop",
  },
];
const baseDefaultMenuItems = fs.existsSync(menuFilePath)
  ? JSON.parse(fs.readFileSync(menuFilePath, "utf8"))
  : JSON.parse(JSON.stringify(defaultMenuItems));

let menuItems = [];

const loadMenuItems = () => {
  try {
    if (fs.existsSync(menuFilePath)) {
      const data = fs.readFileSync(menuFilePath, "utf8");
      menuItems = JSON.parse(data);
    } else {
      // Clone defaults so we don't mutate the original template array
      menuItems = JSON.parse(JSON.stringify(baseDefaultMenuItems));
      saveMenuItems();
    }
  } catch (err) {
    console.error("Error loading menu items:", err);
    menuItems = JSON.parse(JSON.stringify(baseDefaultMenuItems));
  }
};

const saveMenuItems = () => {
  try {
    const dataDir = path.dirname(menuFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    writeJsonAtomic(menuFilePath, menuItems);
  } catch (err) {
    console.error("Error saving menu items:", err);
  }
};

// Initialize menu items on startup
loadMenuItems();

let orders = [
  {
    id: 1,
    userId: 2,
    item: "Cappuccino",
    quantity: 2,
    price: 290.5,
    total: 581.0,
    date: "2026-02-15",
    time: "10:30 AM",
    status: "Delivered",
  },
  {
    id: 2,
    userId: 2,
    item: "Croissant",
    quantity: 1,
    price: 249.0,
    total: 249.0,
    date: "2026-02-15",
    time: "10:35 AM",
    status: "Delivered",
  },
  {
    id: 3,
    userId: 2,
    item: "Butter Chicken",
    quantity: 1,
    price: 746.17,
    total: 746.17,
    date: "2026-02-16",
    time: "12:00 PM",
    status: "Delivered",
  },
  {
    id: 4,
    userId: 2,
    item: "Biryani",
    quantity: 2,
    price: 912.17,
    total: 1824.34,
    date: "2026-02-17",
    time: "7:00 PM",
    status: "Confirmed",
  },
  {
    id: 5,
    userId: 2,
    item: "Chai",
    quantity: 3,
    price: 248.17,
    total: 744.51,
    date: "2026-02-18",
    time: "3:30 PM",
    status: "Pending",
  },
];
let staff = [
  {
    id: 1,
    name: "John Doe",
    role: "Barista",
    email: "john@cafe.com",
    status: "Active",
  },
  {
    id: 2,
    name: "Jane Smith",
    role: "Manager",
    email: "jane@cafe.com",
    status: "Active",
  },
  {
    id: 3,
    name: "Mike Johnson",
    role: "Chef",
    email: "mike@cafe.com",
    status: "Active",
  },
];
const ordersFilePath = path.join(__dirname, "data", "orders.json");
const staffFilePath = path.join(__dirname, "data", "staff.json");

const saveOrders = () => {
  try {
    writeJsonAtomic(ordersFilePath, orders);
  } catch (err) {
    console.error("Error saving orders:", err);
  }
};

const loadOrders = () => {
  try {
    if (fs.existsSync(ordersFilePath)) {
      orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf8"));
    } else {
      saveOrders();
    }
  } catch (err) {
    console.error("Error loading orders:", err);
  }
};

const saveStaff = () => {
  try {
    writeJsonAtomic(staffFilePath, staff);
  } catch (err) {
    console.error("Error saving staff:", err);
  }
};

const loadStaff = () => {
  try {
    if (fs.existsSync(staffFilePath)) {
      staff = JSON.parse(fs.readFileSync(staffFilePath, "utf8"));
    } else {
      saveStaff();
    }
  } catch (err) {
    console.error("Error loading staff:", err);
  }
};

loadOrders();
loadStaff();
let adminNotifications = [];
let adminNotificationsVersion = 0;

// Utility functions
const getUser = (id) => users.find((u) => u.id === id);
const getUserByUsername = (name) =>
  users.find((u) => u.username.toLowerCase() === name.toLowerCase());
const getNextId = (arr) => Math.max(...arr.map((item) => item.id), 0) + 1;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Delivered",
  "Cancelled",
];
const ORDER_TRANSITIONS = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};
const resetTokens = new Map();
const RESET_TOKEN_TTL_MS = 1000 * 60 * 15;
setInterval(() => {
  const now = Date.now();
  for (const [token, payload] of resetTokens.entries()) {
    if (!payload || now > payload.expiresAt) {
      resetTokens.delete(token);
    }
  }
}, 60 * 1000);

const renderPage = (res, view, data = {}) => {
  const baseData = {
    user: res.locals.currentUser ?? null,
    currentUser: res.locals.currentUser ?? null,
    currentRole: res.locals.currentRole ?? "guest",
    cartCount: Number.isFinite(res.locals.cartCount) ? res.locals.cartCount : 0,
    currentPath: res.locals.currentPath || "/",
    appVersion: res.locals.appVersion,
    currentYear: res.locals.currentYear || new Date().getFullYear(),
  };
  res.render(view, { ...baseData, ...data });
};

const validateEmail = (email) => emailRegex.test(email);
const sanitizeText = (value, maxLength = 200) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
const parseIntStrict = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};
const parsePrice = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
};
const sendApiError = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });
const canTransitionOrder = (fromStatus, toStatus) =>
  Array.isArray(ORDER_TRANSITIONS[fromStatus]) &&
  ORDER_TRANSITIONS[fromStatus].includes(toStatus);
const parseOrderDate = (order) => {
  if (order.createdAt) {
    const created = new Date(order.createdAt);
    if (!Number.isNaN(created.getTime())) return created;
  }
  if (order.date) {
    const fromDate = new Date(order.date);
    if (!Number.isNaN(fromDate.getTime())) return fromDate;
  }
  return null;
};
const isMutatingMethod = (method) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(method);
const appendAuditLog = (entry) => {
  try {
    appendLineAtomic(auditLogFilePath, JSON.stringify(entry));
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
};

const validatePassword = (pwd, confirmPwd) => {
  if (pwd !== confirmPwd) return "Passwords do not match";
  if (pwd.length < 6) return "Password must be at least 6 characters";
  return null;
};

const getSessionCart = (req) => {
  if (!Array.isArray(req.session.cart)) {
    req.session.cart = [];
  }
  return req.session.cart;
};

const getCartCount = (req) =>
  getSessionCart(req).reduce((sum, item) => sum + (item.quantity || 0), 0);

const getCartItemsDetailed = (req) => {
  const cart = getSessionCart(req);
  return cart
    .map((cartItem) => {
      const menuItem = menuItems.find((m) => m.id === cartItem.itemId);
      if (!menuItem || !menuItem.available) return null;
      const quantity = Math.max(1, Math.min(10, parseInt(cartItem.quantity)));
      return {
        itemId: menuItem.id,
        name: menuItem.name,
        image: menuItem.image,
        category: menuItem.category,
        price: menuItem.price,
        quantity,
        subtotal: menuItem.price * quantity,
      };
    })
    .filter(Boolean);
};

const pruneInvalidCartItems = (req) => {
  const cart = getSessionCart(req);
  const sanitized = cart.filter((entry) => {
    const item = menuItems.find((m) => m.id === entry.itemId);
    return Boolean(item && item.available);
  });
  req.session.cart = sanitized;
  return sanitized.length !== cart.length;
};

const addToCart = (req, itemId, requestedQuantity) => {
  const quantity = parseInt(requestedQuantity);
  if (Number.isNaN(quantity) || quantity < 1 || quantity > 10) {
    return { success: false, message: "Quantity must be between 1 and 10" };
  }

  const item = menuItems.find((m) => m.id == itemId);
  if (!item || !item.available) {
    return { success: false, message: "Item is not available" };
  }

  const cart = getSessionCart(req);
  const existing = cart.find((c) => c.itemId === item.id);
  if (existing) {
    existing.quantity = Math.min(10, existing.quantity + quantity);
  } else {
    cart.push({ itemId: item.id, quantity });
  }

  return { success: true, message: `${item.name} added to cart` };
};

// Auto-generate admin security key
const generateAdminKey = () => {
  return (
    "admin-" +
    Math.random().toString(36).substring(2, 10) +
    "-" +
    Date.now().toString(36)
  );
};

// Auth middleware
const requireLogin = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== "admin")
    return res.redirect("/");
  next();
};

app.use((req, res, next) => {
  const user = req.session.userId ? getUser(req.session.userId) : null;
  const role = user?.role || "guest";
  res.locals.user = user;
  res.locals.currentUser = user;
  res.locals.currentRole = role;
  res.locals.cartCount = getCartCount(req);
  res.locals.currentPath = req.path;
  res.locals.appVersion = APP_VERSION;
  res.locals.currentYear = new Date().getFullYear();
  next();
});

// Public routes
app.get("/", (req, res) => {
  const featuredItems = [...menuItems]
    .sort(() => 0.5 - Math.random())
    .slice(0, 4);
  renderPage(res, "home/index", {
    title: "CAFE - Cafe Management",
    user: req.session.userId ? getUser(req.session.userId) : null,
    cartCount: getCartCount(req),
    featuredItems,
  });
});
app.get("/login", (req, res) => {
  const adminCount = users.filter((u) => u.role === "admin").length;
  const user = req.session.userId ? getUser(req.session.userId) : null;
  renderPage(res, "auth/login", {
    title: "Login to CAFE",
    error: null,
    success: req.query.success || null,
    adminCount,
    isAdmin: user && user.role === "admin",
  });
});
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const rateKey = getClientKey(req);
  if (isLoginRateLimited(rateKey)) {
    return renderPage(res, "auth/login", {
      title: "Login to CAFE",
      error: "Too many login attempts. Please try again in a few minutes.",
      success: null,
    });
  }

  const user = getUserByUsername(username);
  if (user) {
    const hasBcryptHash =
      typeof user.password === "string" && BCRYPT_HASH_REGEX.test(user.password);
    const passwordValid = hasBcryptHash
      ? await bcrypt.compare(password, user.password)
      : password === user.password;

    if (passwordValid) {
      registerLoginAttempt(rateKey, true);
      // Seamlessly upgrade legacy plaintext passwords to bcrypt hashes.
      if (!hasBcryptHash) {
        user.password = await bcrypt.hash(password, saltRounds);
        saveUsers();
      }
      return req.session.regenerate((sessionErr) => {
        if (sessionErr) {
          console.error("Session regeneration failed:", sessionErr);
          return renderPage(res, "auth/login", {
            title: "Login to CAFE",
            error: "Login failed. Please try again.",
            success: null,
          });
        }
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.username = user.username;
        return res.redirect(user.role === "admin" ? "/admin/dashboard" : "/");
      });
    }
  }
  registerLoginAttempt(rateKey, false);
  renderPage(res, "auth/login", {
    title: "Login to CAFE",
    error: "Invalid username or password",
    success: null,
  });
});
app.get("/signup", (req, res) => {
  renderPage(res, "auth/signup", {
    title: "Sign Up for CAFE",
    error: null,
    success: null,
    formData: {},
  });
});
app.post("/signup", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  const formData = { username: username || "", email: email || "" };
  if (!username || !email || !password || !confirmPassword) {
    return renderPage(res, "auth/signup", {
      title: "Sign Up for CAFE",
      error: "All fields are required",
      success: null,
      formData,
    });
  }
  const pwdError = validatePassword(password, confirmPassword);
  if (pwdError) {
    return renderPage(res, "auth/signup", {
      title: "Sign Up for CAFE",
      error: pwdError,
      success: null,
      formData,
    });
  }
  if (!validateEmail(email)) {
    return renderPage(res, "auth/signup", {
      title: "Sign Up for CAFE",
      error: "Invalid email address",
      success: null,
      formData,
    });
  }
  if (getUserByUsername(username)) {
    return renderPage(res, "auth/signup", {
      title: "Sign Up for CAFE",
      error: "Username already exists",
      success: null,
      formData,
    });
  }
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return renderPage(res, "auth/signup", {
      title: "Sign Up for CAFE",
      error: "Email already registered",
      success: null,
      formData,
    });
  }
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  users.push({
    id: getNextId(users),
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
    role: "user",
  });
  saveUsers();
  res.redirect("/login?success=Account+created+successfully!+Please+log+in");
});
app.post("/auth/request-password-reset", (req, res) => {
  const email = sanitizeText(req.body.email || "", 120).toLowerCase();
  if (!validateEmail(email)) {
    return sendApiError(res, "Please provide a valid email.");
  }

  const user = users.find((u) => u.email.toLowerCase() === email);
  // Return generic response to avoid user enumeration.
  if (!user) {
    return res.json({
      success: true,
      message: "If this email exists, a reset token has been generated.",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  resetTokens.set(token, {
    userId: user.id,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
  });
  return res.json({
    success: true,
    message: "Reset token generated. Use it within 15 minutes.",
    resetToken: token,
  });
});
app.post("/auth/reset-password", async (req, res) => {
  const token = sanitizeText(req.body.token || "", 120);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const tokenData = resetTokens.get(token);

  if (!tokenData || Date.now() > tokenData.expiresAt) {
    if (tokenData) resetTokens.delete(token);
    return sendApiError(res, "Invalid or expired token.");
  }

  const pwdError = validatePassword(password, confirmPassword);
  if (pwdError) {
    return sendApiError(res, pwdError);
  }

  const user = getUser(tokenData.userId);
  if (!user) {
    resetTokens.delete(token);
    return sendApiError(res, "User no longer exists.", 404);
  }

  user.password = await bcrypt.hash(password, saltRounds);
  saveUsers();
  resetTokens.delete(token);
  return res.json({ success: true, message: "Password reset successful." });
});
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});
app.get("/menu", (req, res) => {
  const categories = [...new Set(menuItems.map((item) => item.category))];
  renderPage(res, "menu", {
    title: "Menu",
    menuItems,
    categories,
    user: req.session.userId ? getUser(req.session.userId) : null,
    cartCount: getCartCount(req),
    success: req.query.success || null,
    error: req.query.error || null,
  });
});
app.get("/api/menu", (req, res) => {
  const search = sanitizeText(req.query.search || "", 100).toLowerCase();
  const category = sanitizeText(req.query.category || "", 60);
  const availability = sanitizeText(req.query.availability || "", 20);
  const sort = sanitizeText(req.query.sort || "", 30).toLowerCase();

  let filtered = menuItems.filter((item) => {
    const matchesSearch =
      !search ||
      [item.name, item.description, item.category]
        .join(" ")
        .toLowerCase()
        .includes(search);
    const matchesCategory = !category || item.category === category;
    const matchesAvailability =
      !availability ||
      (availability === "available" && item.available) ||
      (availability === "unavailable" && !item.available);
    return matchesSearch && matchesCategory && matchesAvailability;
  });

  if (sort === "price_asc") filtered = filtered.sort((a, b) => a.price - b.price);
  if (sort === "price_desc")
    filtered = filtered.sort((a, b) => b.price - a.price);
  if (sort === "name_asc")
    filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    success: true,
    total: filtered.length,
    items: filtered,
  });
});
app.get("/dashboard", requireLogin, (req, res) => {
  const user = getUser(req.session.userId);
  const userOrders = orders.filter((o) => o.userId === req.session.userId);
  const activeUserOrders = userOrders.filter((o) => o.status !== "Cancelled");
  renderPage(res, "dashboard", {
    title: "My Dashboard",
    user,
    totalOrders: userOrders.length,
    totalRevenue: activeUserOrders.reduce((sum, o) => sum + o.total, 0),
    menuItemsCount: menuItems.length,
    deliveredOrdersCount: userOrders.filter((o) => o.status === "Delivered")
      .length,
    pendingOrdersCount: userOrders.filter(
      (o) => o.status !== "Delivered" && o.status !== "Cancelled",
    ).length,
    recentOrders: userOrders.slice(-5).reverse(),
  });
});
app.get("/orders", requireLogin, (req, res) => {
  const userOrders = orders.filter((o) => o.userId === req.session.userId);
  renderPage(res, "customer/orders", {
    title: "My Orders",
    orders: userOrders,
    user: getUser(req.session.userId),
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

app.get("/cart", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");

  const hadInvalidItems = pruneInvalidCartItems(req);
  const cartItems = getCartItemsDetailed(req);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  renderPage(res, "customer/cart", {
    title: "My Cart",
    user: getUser(req.session.userId),
    cartItems,
    totalItems,
    totalAmount,
    success:
      req.query.success ||
      (hadInvalidItems ? "Unavailable items were removed from your cart." : null),
    error: req.query.error || null,
  });
});

app.post("/cart/add", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");

  const { itemId, quantity } = req.body;
  const result = addToCart(req, itemId, quantity);
  if (!result.success) {
    return res.redirect(`/menu?error=${encodeURIComponent(result.message)}`);
  }

  res.redirect(`/menu?success=${encodeURIComponent(result.message)}`);
});

app.post("/cart/update", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");

  const itemId = parseIntStrict(req.body.itemId);
  const quantity = parseIntStrict(req.body.quantity);
  if (!itemId || !quantity) {
    return res.redirect("/cart?error=Invalid+cart+update+request");
  }

  const cart = getSessionCart(req);
  const entry = cart.find((c) => c.itemId === itemId);
  if (!entry) {
    return res.redirect("/cart?error=Item+not+found+in+cart");
  }

  if (quantity < 1 || quantity > 10) {
    return res.redirect("/cart?error=Quantity+must+be+between+1+and+10");
  }

  entry.quantity = quantity;
  res.redirect("/cart");
});

app.post("/cart/remove", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");

  const itemId = parseIntStrict(req.body.itemId);
  if (!itemId) {
    return res.redirect("/cart?error=Invalid+item");
  }

  req.session.cart = getSessionCart(req).filter((c) => c.itemId !== itemId);
  res.redirect("/cart?success=Item+removed+from+cart");
});

app.post("/cart/confirm", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");

  pruneInvalidCartItems(req);
  const cartItems = getCartItemsDetailed(req);
  if (cartItems.length === 0) {
    return res.redirect("/cart?error=Your+cart+is+empty");
  }

  const unavailableInCheckout = cartItems.find((cartItem) => {
    const menuItem = menuItems.find((m) => m.id === cartItem.itemId);
    return !menuItem || !menuItem.available;
  });
  if (unavailableInCheckout) {
    return res.redirect(
      "/cart?error=Some+items+are+no+longer+available.+Please+review+your+cart",
    );
  }

  const now = new Date();
  cartItems.forEach((cartItem) => {
    orders.push({
      id: getNextId(orders),
      userId: req.session.userId,
      item: cartItem.name,
      quantity: cartItem.quantity,
      price: cartItem.price,
      total: cartItem.subtotal,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      createdAt: now.toISOString(),
      status: "Pending",
    });
  });

  saveOrders();
  req.session.cart = [];
  res.redirect(
    `/orders?success=${encodeURIComponent("Order placed successfully!")}`,
  );
});

app.get("/profile", requireLogin, (req, res) => {
  const user = getUser(req.session.userId);
  renderPage(res, "profile", {
    title: "My Profile",
    user,
    error: null,
    success: null,
  });
});

app.post("/profile", requireLogin, async (req, res) => {
  const user = getUser(req.session.userId);
  const email = sanitizeText(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!email) {
    return renderPage(res, "profile", {
      title: "My Profile",
      user,
      error: "Email is required.",
      success: null,
    });
  }

  if (!validateEmail(email)) {
    return renderPage(res, "profile", {
      title: "My Profile",
      user,
      error: "Please provide a valid email address.",
      success: null,
    });
  }

  // Prevent email collision
  const existing = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== user.id,
  );
  if (existing) {
    return renderPage(res, "profile", {
      title: "My Profile",
      user,
      error: "This email is already in use by another account.",
      success: null,
    });
  }

  user.email = email;

  if (password || confirmPassword) {
    const pwdError = validatePassword(password, confirmPassword);
    if (pwdError) {
      return renderPage(res, "profile", {
        title: "My Profile",
        user,
        error: pwdError,
        success: null,
      });
    }

    user.password = await bcrypt.hash(password, saltRounds);
  }

  saveUsers();

  renderPage(res, "profile", {
    title: "My Profile",
    user,
    error: null,
    success: "Profile updated successfully.",
  });
});

app.get("/orders/live", requireLogin, (req, res) => {
  const userOrders = orders.filter((o) => o.userId === req.session.userId);
  res.json({
    success: true,
    orders: userOrders,
  });
});
app.post("/orders/add", requireLogin, (req, res) => {
  if (req.session.role === "admin") return res.redirect("/menu");
  const result = addToCart(req, req.body.itemId, req.body.quantity);
  if (!result.success) {
    return res.redirect(`/menu?error=${encodeURIComponent(result.message)}`);
  }
  res.redirect(`/cart?success=${encodeURIComponent(result.message)}`);
});

app.post("/orders/update-status", requireAdmin, (req, res) => {
  const { orderId, status } = req.body;
  const nextStatus = sanitizeText(status, 30);
  const parsedOrderId = parseIntStrict(orderId);

  if (!parsedOrderId) {
    return sendApiError(res, "Invalid order id.");
  }

  if (!ORDER_STATUSES.includes(nextStatus)) {
    return sendApiError(res, "Invalid status.");
  }

  const order = orders.find((o) => o.id === parsedOrderId);
  if (!order) {
    return sendApiError(res, "Order not found.", 404);
  }

  if (order.status === nextStatus) {
    return res.json({ success: true, message: "Status is already up to date", order });
  }

  if (!canTransitionOrder(order.status, nextStatus)) {
    return sendApiError(
      res,
      `Invalid status transition from ${order.status} to ${nextStatus}.`,
      409,
    );
  }

  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  saveOrders();
  res.json({
    success: true,
    message: `Order #${parsedOrderId} updated to ${nextStatus}`,
    order,
  });
});

app.post("/orders/cancel", requireLogin, (req, res) => {
  const { orderId, reason } = req.body;
  const parsedOrderId = parseIntStrict(orderId);
  if (!parsedOrderId) {
    return sendApiError(res, "Invalid order id.");
  }
  const order = orders.find((o) => o.id === parsedOrderId);

  if (!order) {
    return res.json({
      success: false,
      message: "Order not found",
    });
  }

  if (["Delivered", "Cancelled"].includes(order.status)) {
    return res.json({
      success: false,
      message: `Cannot cancel ${order.status} orders`,
    });
  }

  if (order.userId !== req.session.userId && req.session.role !== "admin") {
    return res.json({
      success: false,
      message: "Unauthorized",
    });
  }

  const cancellationReason = sanitizeText(reason, 280);
  if (req.session.role !== "admin" && !cancellationReason) {
    return res.json({
      success: false,
      message: "Cancellation reason is required",
    });
  }

  order.status = "Cancelled";
  order.cancellationReason =
    cancellationReason || order.cancellationReason || "No reason provided";
  order.cancelledBy = req.session.username || `User#${req.session.userId}`;
  order.cancelledAt = new Date().toLocaleString();

  adminNotifications.push({
    id: Date.now(),
    type: "order_cancelled",
    message: `Order #${order.id} cancelled by ${order.cancelledBy}. Reason: ${order.cancellationReason}`,
    time: order.cancelledAt,
  });
  adminNotificationsVersion += 1;
  saveOrders();

  res.json({
    success: true,
    message: `Order #${parsedOrderId} has been cancelled`,
    order,
  });
});

app.post("/orders/update-quantity", requireLogin, (req, res) => {
  const { orderId, quantity } = req.body;
  const parsedOrderId = parseIntStrict(orderId);
  const parsedQuantity = parseIntStrict(quantity);
  if (!parsedOrderId) {
    return sendApiError(res, "Invalid order id.");
  }
  const order = orders.find((o) => o.id === parsedOrderId);

  if (!order) {
    return res.json({ success: false, message: "Order not found" });
  }

  // Check if the order belongs to the current user or if user is admin
  if (order.userId !== req.session.userId && req.session.role !== "admin") {
    return res.json({ success: false, message: "Unauthorized" });
  }

  // Check if order can be modified
  if (!["Pending", "Confirmed"].includes(order.status)) {
    return res.json({
      success: false,
      message: `Cannot modify ${order.status} orders`,
    });
  }

  if (!parsedQuantity || parsedQuantity < 1 || parsedQuantity > 10) {
    return res.json({
      success: false,
      message: "Quantity must be between 1 and 10",
    });
  }

  order.quantity = parsedQuantity;
  order.total = order.price * parsedQuantity;
  order.updatedAt = new Date().toISOString();
  saveOrders();
  res.json({ success: true, message: "Order quantity updated", order });
});

app.get("/about", (req, res) => {
  renderPage(res, "pages/about", {
    title: "About CAFE",
    user: req.session.userId ? getUser(req.session.userId) : null,
  });
});

app.get("/contact", (req, res) => {
  renderPage(res, "pages/contact", {
    title: "Contact Us",
    user: req.session.userId ? getUser(req.session.userId) : null,
    success: req.query.success || null,
    error: req.query.error || null,
  });
});
app.post("/contact", (req, res) => {
  const name = sanitizeText(req.body.name, 100);
  const email = sanitizeText(req.body.email, 120).toLowerCase();
  const subject = sanitizeText(req.body.subject, 140);
  const message = sanitizeText(req.body.message, 1000);

  if (!name || !email || !subject || !message) {
    return res.redirect("/contact?error=Please+fill+all+fields");
  }
  if (!validateEmail(email)) {
    return res.redirect("/contact?error=Please+enter+a+valid+email");
  }

  if (ENABLE_INFO_LOGS) {
    // Optional local visibility while debugging contact submissions.
    console.log("Contact form submission:", {
      name,
      email,
      subject,
      message,
      createdAt: new Date().toISOString(),
    });
  }

  return res.redirect("/contact?success=Thanks!+We+received+your+message");
});

app.get("/admin/dashboard", requireAdmin, (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeOrders = orders.filter((o) => o.status !== "Cancelled");
  renderPage(res, "admin/dashboard", {
    title: "Admin Dashboard",
    totalOrders: orders.length,
    totalRevenue: activeOrders.reduce((sum, order) => sum + order.total, 0),
    activeOrdersCount: activeOrders.length,
    menuItemsCount: menuItems.length,
    staffCount: staff.length,
    todayOrders: orders.filter((o) => {
      const orderDate = parseOrderDate(o);
      return orderDate && orderDate >= todayStart;
    }).length,
    user: getUser(req.session.userId),
  });
});

app.get("/admin/menu", requireAdmin, (req, res) => {
  renderPage(res, "admin/menu", {
    title: "Manage Menu",
    menuItems,
    user: getUser(req.session.userId),
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

app.post("/admin/menu/add", requireAdmin, upload.single("image"), (req, res) => {
  const name = sanitizeText(req.body.name, 80);
  const category = sanitizeText(req.body.category, 60);
  const description = sanitizeText(req.body.description, 300);
  const price = parsePrice(req.body.price);
  if (!name || !price || !category || !description) {
    return res.redirect("/admin/menu?error=All+menu+fields+are+required");
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  menuItems.push({
    id: getNextId(menuItems),
    name,
    price,
    category,
    description,
    available: true,
    image: imageUrl,
  });
  saveMenuItems();
  res.redirect("/admin/menu?success=Menu+item+added+successfully");
});

app.get("/admin/menu/edit/:id", requireAdmin, (req, res) => {
  const item = menuItems.find((m) => m.id == req.params.id);
  renderPage(res, "admin/menu-edit", {
    title: "Edit Menu Item",
    item,
    user: getUser(req.session.userId),
  });
});

app.post(
  "/admin/menu/edit/:id",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    const name = sanitizeText(req.body.name, 80);
    const category = sanitizeText(req.body.category, 60);
    const description = sanitizeText(req.body.description, 300);
    const price = parsePrice(req.body.price);
    if (!name || !price || !category || !description) {
      return res.redirect("/admin/menu?error=All+menu+fields+are+required");
    }
    const item = menuItems.find((m) => m.id == req.params.id);
    if (item) {
      item.name = name;
      item.price = price;
      item.category = category;
      item.description = description;
      if (req.file) {
        item.image = `/uploads/${req.file.filename}`;
      }
      saveMenuItems();
    }
    res.redirect("/admin/menu?success=Menu+item+updated+successfully");
  },
);

app.get("/admin/menu/delete/:id", requireAdmin, (req, res) => {
  const itemId = parseIntStrict(req.params.id);
  const item = menuItems.find((m) => m.id === itemId);
  if (!item) {
    return res.redirect("/admin/menu?error=Menu+item+not+found");
  }
  // Soft delete for data integrity: hide from new orders but preserve history.
  item.available = false;
  item.deletedAt = new Date().toISOString();
  saveMenuItems();
  res.redirect("/admin/menu?success=Menu+item+disabled+successfully");
});

app.get("/admin/orders", requireAdmin, (req, res) => {
  const activeOrders = orders.filter((o) => o.status !== "Cancelled");
  renderPage(res, "admin/orders", {
    title: "Manage Orders",
    orders: activeOrders,
    activeOrders,
    user: getUser(req.session.userId),
  });
});

app.get("/admin/orders/cancelled", requireAdmin, (req, res) => {
  const cancelledOrders = orders
    .filter((o) => o.status === "Cancelled")
    .map((o) => ({
      ...o,
      customerName: getUser(o.userId)?.username || `User#${o.userId}`,
    }))
    .reverse();

  renderPage(res, "admin/cancelled-orders", {
    title: "Cancelled Orders",
    cancelledOrders,
    user: getUser(req.session.userId),
  });
});

app.get("/admin/orders/live", requireAdmin, (req, res) => {
  const activeOrders = orders.filter((o) => o.status !== "Cancelled");
  res.json({
    success: true,
    orders: activeOrders,
    notifications: adminNotifications.slice(-10).reverse(),
    notificationsVersion: adminNotificationsVersion,
    summary: {
      totalOrders: activeOrders.length,
      totalItems: activeOrders.reduce((sum, o) => sum + o.quantity, 0),
      totalRevenue: activeOrders.reduce((sum, o) => sum + o.total, 0),
    },
  });
});

app.post("/admin/notifications/clear", requireAdmin, (req, res) => {
  adminNotifications = [];
  adminNotificationsVersion += 1;
  res.json({ success: true, message: "Notification history cleared" });
});

app.get("/admin/staff", requireAdmin, (req, res) => {
  renderPage(res, "admin/staff", {
    title: "Manage Staff",
    staff,
    user: getUser(req.session.userId),
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

app.post("/admin/staff/add", requireAdmin, (req, res) => {
  const name = sanitizeText(req.body.name, 80);
  const role = sanitizeText(req.body.role, 60);
  const email = sanitizeText(req.body.email, 120).toLowerCase();
  if (!name || !role || !email) {
    return res.redirect("/admin/staff?error=All+staff+fields+are+required");
  }
  if (!validateEmail(email)) {
    return res.redirect("/admin/staff?error=Please+provide+a+valid+email+address");
  }
  staff.push({
    id: getNextId(staff),
    name,
    role,
    email,
    status: "Active",
  });
  saveStaff();
  res.redirect("/admin/staff?success=Staff+member+added+successfully");
});

const buildReportData = () => {
  const activeOrders = orders.filter((o) => o.status !== "Cancelled");

  const totalRevenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const itemsSold = activeOrders.reduce((sum, o) => sum + o.quantity, 0);
  const avgOrderValue =
    activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0;

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const monthlyBuckets = monthLabels.reduce((acc, month) => {
    acc[month] = { month, revenue: 0, orders: 0 };
    return acc;
  }, {});
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setMonth(monthStart.getMonth() - 1);

  activeOrders.forEach((order) => {
    const parsed = parseOrderDate(order);
    if (!parsed) return;
    const monthLabel = monthLabels[parsed.getMonth()];
    if (!monthlyBuckets[monthLabel]) return;
    monthlyBuckets[monthLabel].orders += 1;
    monthlyBuckets[monthLabel].revenue += Number(order.total) || 0;
  });

  const monthlyData = monthLabels.map((month) => ({
    month,
    revenue: monthlyBuckets[month].revenue,
    orders: monthlyBuckets[month].orders,
  }));

  const byItem = activeOrders.reduce((acc, order) => {
    if (!acc[order.item]) {
      acc[order.item] = { item: order.item, quantity: 0, revenue: 0 };
    }
    acc[order.item].quantity += Number(order.quantity) || 0;
    acc[order.item].revenue += Number(order.total) || 0;
    return acc;
  }, {});
  const topItems = Object.values(byItem)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const dailyStats = {
    todayOrders: activeOrders.filter((o) => {
      const d = parseOrderDate(o);
      return d && d >= todayStart;
    }).length,
    weekOrders: activeOrders.filter((o) => {
      const d = parseOrderDate(o);
      return d && d >= weekStart;
    }).length,
    monthOrders: activeOrders.filter((o) => {
      const d = parseOrderDate(o);
      return d && d >= monthStart;
    }).length,
  };

  return {
    activeOrders,
    monthlyData,
    topItems,
    dailyStats,
    stats: {
      totalRevenue,
      itemsSold,
      avgOrderValue,
    },
  };
};

app.get("/admin/reports", requireAdmin, (req, res) => {
  const reportData = buildReportData();

  renderPage(res, "admin/reports", {
    title: "Reports & Analytics",
    orders,
    activeOrders: reportData.activeOrders,
    monthlyData: reportData.monthlyData,
    topItems: reportData.topItems,
    dailyStats: reportData.dailyStats,
    user: getUser(req.session.userId),
    stats: reportData.stats,
  });
});

app.get("/admin/reports/export.csv", requireAdmin, (req, res) => {
  const reportData = buildReportData();
  const header = "Metric,Value";
  const rows = [
    ["Total Revenue", reportData.stats.totalRevenue.toFixed(2)],
    ["Items Sold", String(reportData.stats.itemsSold)],
    ["Average Order Value", reportData.stats.avgOrderValue.toFixed(2)],
    ["Today Orders", String(reportData.dailyStats.todayOrders)],
    ["Last 7 Days Orders", String(reportData.dailyStats.weekOrders)],
    ["Last 30 Days Orders", String(reportData.dailyStats.monthOrders)],
  ];
  reportData.topItems.forEach((item, idx) => {
    rows.push([`Top Item ${idx + 1}`, `${item.item} (${item.quantity})`]);
  });

  const csv = [header, ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join(
    "\n",
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cafe-report-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send(csv);
});

app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    env: APP_ENV,
    version: APP_VERSION,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("*", (req, res) => {
  renderPage(res.status(404), "404", { title: "Page Not Found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled application error:", err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api/") || req.accepts("json")) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
  return renderPage(res.status(500), "404", {
    title: "Server Error",
  });
});

const DEFAULT_PORT = Number(process.env.PORT) || 3001;
const MAX_PORT_TRIES = 10;
let activeServer = null;

const startServer = (port, attemptsLeft) => {
  const server = app
    .listen(port, () => {
      activeServer = server;
      console.log(`CAFE server running on http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        const nextPort = port + 1;
        if (ENABLE_INFO_LOGS) {
          console.warn(
            `Port ${port} is in use. Trying http://localhost:${nextPort} ...`,
          );
        }
        startServer(nextPort, attemptsLeft - 1);
        return;
      }
      throw err;
    });

  return server;
};

startServer(DEFAULT_PORT, MAX_PORT_TRIES);

const gracefulShutdown = (signal) => {
  if (ENABLE_INFO_LOGS) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
  }
  if (!activeServer) process.exit(0);
  activeServer.close(() => {
    if (ENABLE_INFO_LOGS) {
      console.log("HTTP server closed.");
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

